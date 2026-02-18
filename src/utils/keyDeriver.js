/**
 * Derives AES-128 decryption key from PlayAuth using BytePlus VePlayer SDK's XGSecretKey.
 * The key is returned as a UTF-8 string (16 chars = 16 bytes for AES-128).
 */
import crypto from "crypto";

// Browser shims for Node.js
if (typeof globalThis.navigator === "undefined") {
  globalThis.navigator = { userAgent: "Mozilla/5.0 Chrome/120" };
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}
if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement: () => ({ style: {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof globalThis.MediaSource === "undefined") {
  globalThis.MediaSource = class {
    static isTypeSupported() { return true; }
  };
}
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto.webcrypto;
}

// Patch the module to expose XGSecretKey
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const fs = await import("fs");
const path = await import("path");
const pluginPath = require.resolve("@byteplus/veplayer/plugin/hlsEncrypt.js");
const patchedPath = pluginPath.replace("hlsEncrypt.js", "_hlsEncrypt_patched.js");

// Create patched version if not exists
try {
  fs.default.accessSync(patchedPath);
} catch {
  let code = fs.default.readFileSync(pluginPath, "utf8");
  code = code.replace(
    "e.XGSecretKey=cg,e.aes4js=Ym,e.util=dv",
    'e.XGSecretKey=cg,e.aes4js=Ym,e.util=dv;if(typeof globalThis!=="undefined"){globalThis.__XGSecretKey=cg}'
  );
  fs.default.writeFileSync(patchedPath, code);
}

require(patchedPath);
const XGSecretKey = globalThis.__XGSecretKey;

// Cache: kid → keyString
const keyCache = new Map();

/**
 * Derive AES-128 key from PlayAuth and PlayAuthId (kid).
 * Returns a 16-char UTF-8 string used as AES-128-CBC key.
 */
export async function deriveKey(playAuth, kid) {
  if (keyCache.has(kid)) return keyCache.get(kid);

  const xg = new XGSecretKey({
    secretKey: playAuth,
    kid,
    drmType: "private_encrypt",
    vid: "",
    getLicenseUrl: "",
    useUnionInfoDRM: false,
    sessionId: "node-" + Date.now(),
  });

  const result = await xg.getKeyValue();
  const keyStr = result?.clearKeys?.[kid];
  if (!keyStr) throw new Error(`Failed to derive key for kid ${kid}`);

  keyCache.set(kid, keyStr);
  return keyStr;
}

/**
 * Decrypt an AES-128-CBC encrypted buffer using the given key string.
 */
export function decryptSegment(encrypted, keyStr) {
  const key = Buffer.from(keyStr, "utf-8");
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export { keyCache };
