import express from "express";
import cors from "cors";
import axios from "axios";
import crypto from "crypto";
import { config } from "dotenv";

config();

const app = express();
const PORT = process.env.PORT || 3027;
const API_TOKEN = process.env.API_TOKEN;

// Lazy load keyDeriver only when needed (for /proxy and /derive-key)
let deriveKey, decryptSegment, keyCache;
let keyDeriverLoaded = false;
const loadKeyDeriver = async () => {
  if (!keyDeriverLoaded) {
    try {
      const module = await import("./src/utils/keyDeriver.js");
      deriveKey = module.deriveKey;
      decryptSegment = module.decryptSegment;
      keyCache = module.keyCache;
      keyDeriverLoaded = true;
      console.log('[KeyDeriver] Loaded successfully');
    } catch (error) {
      console.error('[KeyDeriver] Load failed:', error.message);
      // Return mock functions if load fails
      return {
        deriveKey: async () => { throw new Error('KeyDeriver not available'); },
        decryptSegment: () => { throw new Error('KeyDeriver not available'); },
        keyCache: new Map(),
      };
    }
  }
  return { deriveKey, decryptSegment, keyCache };
};

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static frontend
app.use(express.static("public"));

// Proxy API requests with Authorization header
app.all("/api/*", async (req, res) => {
  try {
    if (!API_TOKEN) {
      return res.status(500).json({
        error: "API_TOKEN not configured",
        message: "Please set API_TOKEN environment variable in Vercel"
      });
    }
    
    const apiPath = req.path.replace(/^\/api/, '');
    const url = `https://captain.sapimu.au/shortbox/api${apiPath}`;
    
    console.log(`[API Proxy] ${req.method} ${url}`);
    
    const response = await axios({
      method: req.method,
      url,
      params: req.query,
      data: req.body,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
      },
      timeout: 30000,
    });
    res.json(response.data);
  } catch (error) {
    console.error('[API Proxy Error]', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data,
    });
  }
});

// Image proxy untuk bypass CORS
app.get("/img", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing url");
  try {
    console.log(`[IMG Proxy] ${url}`);
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    const contentType = response.headers["content-type"] || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('[IMG Proxy Error]', error.message);
    res.status(502).send("Image fetch failed");
  }
});

// API documentation
app.get("/api-docs", (req, res) => {
  const host = req.protocol + "://" + req.get("host");
  res.json({
    name: "ShortBox Player",
    version: "1.0",
    description: "ShortBox drama player with server-side DRM decryption",
    player: host + "/player",
    endpoints: {
      proxy: {
        "GET /proxy": { description: "HLS proxy with DRM decryption", params: { url: "Video URL", kid: "Key ID" } },
        "GET /derive-key": { description: "Derive decryption key", params: { playAuth: "PlayAuth token", kid: "Key ID" } },
      },
    },
    flow: [
      "1. Visit /player to browse dramas",
      "2. API requests proxied to captain.sapimu.au with Bearer token",
      "3. Video streaming handled via /proxy with DRM decryption",
    ],
  });
});

// Derive and cache key for a given PlayAuth + kid
app.get("/derive-key", async (req, res) => {
  const { playAuth, kid } = req.query;
  if (!playAuth || !kid) return res.status(400).json({ error: "Missing playAuth or kid" });
  try {
    const { deriveKey } = await loadKeyDeriver();
    const keyStr = await deriveKey(playAuth, kid);
    res.json({ kid, keyLength: keyStr.length, cached: true });
  } catch (e) {
    console.error('[Derive Key Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// HLS proxy with server-side decryption
app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  const kid = req.query.kid;
  if (!url) return res.status(400).send("Missing url");
  try {
    const r = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
    const ct = r.headers["content-type"] || "application/octet-stream";
    res.set("Content-Type", ct);
    res.set("Access-Control-Allow-Origin", "*");

    // Handle m3u8 playlists: remove EXT-X-KEY, rewrite URLs
    if (ct.includes("mpegurl") || url.endsWith(".m3u8")) {
      let text = Buffer.from(r.data).toString("utf-8");
      const base = url.substring(0, url.lastIndexOf("/") + 1);

      // Remove EXT-X-KEY line (we decrypt server-side)
      text = text.replace(/^#EXT-X-KEY:.*$/gm, "");

      // Rewrite .ts URLs through proxy with kid for decryption
      text = text.replace(/^(?!#)(.+\.ts.*)$/gm, (line) => {
        const full = line.startsWith("http") ? line : base + line;
        let proxyUrl = "/proxy?url=" + encodeURIComponent(full);
        if (kid) proxyUrl += "&kid=" + encodeURIComponent(kid);
        return proxyUrl;
      });
      // Rewrite sub-m3u8 URLs
      text = text.replace(/^(?!#)(.+\.m3u8.*)$/gm, (line) => {
        const full = line.startsWith("http") ? line : base + line;
        let proxyUrl = "/proxy?url=" + encodeURIComponent(full);
        if (kid) proxyUrl += "&kid=" + encodeURIComponent(kid);
        return proxyUrl;
      });
      res.set("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(text);
    }

    // Handle TS segments: decrypt if key is cached
    if (url.includes(".ts") && kid) {
      const { keyCache, decryptSegment } = await loadKeyDeriver();
      if (keyCache.has(kid)) {
        const buffer = Buffer.from(r.data);
        if (buffer[0] !== 0x47) {
          try {
            const decrypted = decryptSegment(buffer, keyCache.get(kid));
            res.set("Content-Type", "video/mp2t");
            return res.send(decrypted);
          } catch {
            // Decryption failed, serve as-is
          }
        }
        res.set("Content-Type", "video/mp2t");
        return res.send(buffer);
      }
    }

    res.send(Buffer.from(r.data));
  } catch (e) {
    res.status(502).send(e.message);
  }
});

// Export for Vercel, or start server for local
export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`ShortBox API running on http://localhost:${PORT}`);
  });
}
