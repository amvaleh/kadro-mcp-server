# kadro-mcp-server

An MCP (Model Context Protocol) server that lets AI assistants search Kadro
photographers/packages and book a guest reservation on a user's behalf,
ending with a payment link — the assistant never touches payment or login
itself. It's a thin wrapper around Kadro's `Api::Agent::V1` REST API (see
the `Main-Rails` repo, `app/controllers/api/agent/v1/`).

## Tools

- `search_shoot_types` — list service types and their ids.
- `search_photographers` — find photographers for a shoot_type_id (+ optional city_id).
- `get_photographer_packages` — a photographer's real packages and prices.
- `create_reservation` — place a 15-minute guest hold. No payment involved.
- `get_payment_link` — a URL for the human to open themselves to verify their
  phone and pay. This is the boundary: no tool here ever asks for or handles
  card details, OTP codes, or passwords.
- `get_reservation_status` — check payment/confirmation status. Paid is not
  the same as confirmed — see the tool description.

## Setup

```bash
npm install
cp .env.example .env
npm run register -- "your-platform-name" "you@example.com"   # prints a token
# paste the printed KADRO_API_TOKEN into .env
npm run build
npm start   # listens on :3100 (or $PORT), MCP endpoint is POST /mcp
```

The registration is self-service and instant, capped at a `daily_limit` of 5
requests/day by default (see `ApiPartner` in Main-Rails). Email Kadro to
request a higher limit for this server's token once it's actually deployed.

## Running with Docker

```bash
docker build -t kadro-mcp-server .
docker run -p 3100:3100 --env-file .env kadro-mcp-server
```

## Deploying on the same server as the Rails app

This is a separate Node process from the Rails app — it does not go through
Capistrano. A reasonable setup, matching this server's existing Docker usage
for other services (gitlab, typesense):

1. Build and run the Docker image above on the server (or run
   `npm run build && npm start` under a process manager like `systemd` or `pm2`).
2. Point a path or subdomain at it through whatever already terminates TLS
   for kadro.co (nginx, based on the existing setup). Example nginx snippet —
   adjust to match the real server-block layout, this repo has no visibility
   into it:

   ```nginx
   location /mcp {
     proxy_pass http://127.0.0.1:3100/mcp;
     proxy_set_header Host $host;
     proxy_http_version 1.1;
     proxy_set_header Connection "";
   }
   ```

3. The public MCP endpoint ends up at something like `https://www.kadro.co/mcp`
   or `https://mcp.kadro.co/mcp` — whichever this repo's operator prefers. Put
   that URL in `public/llms.txt` (Main-Rails) once it's live, alongside the
   plain REST API section already there.

## Verifying it's alive

```bash
curl https://<wherever-it's-deployed>/healthz   # -> ok
```
