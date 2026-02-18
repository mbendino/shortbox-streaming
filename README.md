# ShortBox Player

Drama streaming player dengan server-side DRM decryption.

## Deploy ke Vercel

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Login
```bash
vercel login
```

### 3. Set Environment Variables
```bash
vercel env add API_TOKEN
```

### 4. Deploy
```bash
vercel --prod
```

## Environment Variables

Tambahkan di Vercel Dashboard → Settings → Environment Variables:

- `API_TOKEN` - Bearer token untuk captain.sapimu.au API

## Local Development

```bash
npm install
npm start
```

Server: `http://localhost:3027`

## Features

- 📺 Drama browsing & search
- 🎬 HLS video streaming
- 🔒 Server-side DRM decryption
- 🖼️ Image proxy (CORS bypass)
- 🌐 Multi-language support

## Tech Stack

- Express.js
- BytePlus VePlayer SDK
- HLS.js
- Axios
