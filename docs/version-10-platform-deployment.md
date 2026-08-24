# Version 10 Platform Deployment

Version 10 requires the full platform app: React build output plus the Express API server. Static-only GitHub Pages is insufficient for the builder Command Center because the builder tools save and load project, estimate, supplier, invoice, weather, receipt, and mileage data through server routes.

GitHub Pages can still host the public homeowner website, but it cannot serve the Version 10 builder tools by itself.

## Local test URL

- Use `http://localhost:4000/command-center` for same-machine testing.
- From `platform/client`, run `npm run build`.
- From `platform/server`, run `npm install` once and then `npm start`.
- Verify local routes before copying to a host:
  - `http://localhost:4000/health`
  - `http://localhost:4000/command-center`
  - `http://localhost:4000/api/command-center`
  - `http://localhost:4000/api/weather/forecast?zip=87106`

## LAN URL

- Use a LAN URL only for devices on the same network, for example `http://10.0.0.166:4000/command-center`.
- The older `10.0.0.166:3001` design server is a private-network address, not a public external URL.
- Do not send a LAN URL as the external review link unless the reviewer is on that same network or connected through VPN.

## Public external URL

- Public review requires a reachable public host or tunnel.
- Valid options include a public VPS with nginx or Caddy, Cloudflare Tunnel, Tailscale Funnel, ngrok, or another HTTPS tunnel/reverse proxy that reaches the Express server.
- The public URL should route browser requests for `/command-center` to the Express process, not to static GitHub Pages.
- Re-check `/health` and `/api/command-center` from a phone or network outside the LAN before calling the review link ready.

## Build And Deploy Sequence

1. From `platform/client`, run `npm run build`.
2. Copy `platform/client/build` to the target host.
3. Copy `platform/server` to the target host, excluding `node_modules`.
4. From the copied `platform/server`, run `npm install --omit=dev`.
5. Start or restart the Node process with `npm start`, systemd, pm2, or the host's process manager.
6. Verify `/health`, `/command-center`, `/api/command-center`, and `/api/weather/forecast?zip=87106`.
7. If this is for public review, verify the same routes through the public domain or tunnel URL.

## Example Script

`deploy-platform.example.sh` performs the build and copy steps, but it intentionally requires a caller-supplied `TARGET_HOST`. It does not define the public review URL because that must be a reachable host or tunnel chosen for the deployment.

```bash
TARGET_HOST=ahmad@example.com TARGET_DIR=/home/ahmad/abqadu-platform ./deploy-platform.example.sh
```

After copying, start the server on the host:

```bash
cd /home/ahmad/abqadu-platform/platform/server
npm start
```

## Required Environment Variables

- `PORT`: Express port. Defaults to `4000` when unset.
- `COMMAND_CENTER_STORE_PATH`: Optional writable JSON store path for command center data. Use an absolute path on the server if the deploy directory is replaced during releases.
- `NODE_ENV`: Set to `production` for hosted review.

Optional integration variables remain optional for Version 10 unless credentials are available: Clerk, Stripe, Twilio, InvoiceShelf, SMTP, EspoCRM, OCR, and weather provider settings. Do not present those integrations as live until the corresponding credentials and route checks are confirmed on the host.

## Review Readiness Checklist

- `npm run build` completed for `platform/client`.
- Server dependencies installed on the host with `npm install --omit=dev`.
- The Express process is running and serving the React build.
- `/health` returns a successful response.
- `/command-center` loads through the intended URL.
- `/api/command-center` returns JSON.
- `/api/weather/forecast?zip=87106` returns a response or a documented provider/configuration error.
- Public review link uses a reachable public host or tunnel, not static-only GitHub Pages and not a private LAN address.
