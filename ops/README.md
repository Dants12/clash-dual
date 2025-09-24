# Ops

## Nginx reverse proxy

The provided [`nginx.conf`](./nginx.conf) is designed to serve the built client bundle from `/var/www/clashdual` while proxying WebSocket traffic to the game server.

1. Copy the file to your Nginx configuration directory, for example:
   ```bash
   sudo cp ops/nginx.conf /etc/nginx/sites-available/clashdual.conf
   sudo ln -sf /etc/nginx/sites-available/clashdual.conf /etc/nginx/sites-enabled/clashdual.conf
   ```
2. Ensure the static site is deployed to `/var/www/clashdual` (adjust the `root` directive if you use a different path).
3. Reload Nginx after enabling the site:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

The `/` location falls back to `index.html` so the SPA routes keep working and disables caching with `Cache-Control: no-store`. Static assets under `/assets/` are cached for one year with `immutable`. WebSocket requests under `/ws` are proxied to the server listening on `127.0.0.1:8081` with the necessary upgrade headers.
