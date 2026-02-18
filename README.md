# ShortBox Player

Drama streaming player with server-side DRM decryption.

## Features

- 📺 Drama browsing & search
- 🎬 HLS video streaming with DRM decryption
- 🖼️ Image proxy (CORS bypass)
- 🌐 Multi-language support (8 languages)
- 🔒 Server-side encryption handling

## Tech Stack

- Express.js
- BytePlus VePlayer SDK
- HLS.js
- Axios

## Installation

```bash
npm install
```

## Configuration

Create `.env` file:

```env
API_TOKEN=your_bearer_token_here
PORT=3027
```

## Run

```bash
# Development
npm start

# Production with PM2
pm2 start server.js --name shortbox-player
pm2 save
```

## Access

- **Player:** `http://localhost:3027/`
- **API Docs:** `http://localhost:3027/api-docs`

## Deployment

### VPS Deployment

1. Clone repository
2. Install dependencies: `npm install`
3. Configure `.env`
4. Run with PM2: `pm2 start server.js --name shortbox-player`
5. Open firewall: `ufw allow 3027/tcp`

### Access via Domain

Point your domain A record to server IP, then access:
- `http://yourdomain.com:3027`

Or setup nginx reverse proxy to remove port number.

## API Endpoints

All API requests are proxied to external API with Bearer authentication.

- `GET /api/list` - Browse dramas
- `GET /api/new-list` - Trending dramas
- `GET /api/hot-search` - Hot search
- `GET /api/search` - Search dramas
- `GET /api/detail/:id` - Drama details
- `GET /api/episodes/:id` - Episode list
- `GET /img?url=...` - Image proxy
- `GET /proxy?url=...&kid=...` - Video proxy with DRM decryption
- `GET /derive-key?playAuth=...&kid=...` - DRM key derivation

## License

MIT
