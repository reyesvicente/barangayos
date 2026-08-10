# Droplet Sizing Notes

BarangayOS is a records-management PWA for barangay staff (per `docs/ARCHITECTURE.md`), not a public high-traffic site:

- Concurrent users = barangay hall staff logged in at once — realistically 5–30 people, even for a busy barangay.
- It's offline-first (IndexedDB write queue), so clients batch/sync writes rather than hammering the API continuously.
- Media uploads are offloaded to Cloudinary, so the Droplet isn't serving/processing large file traffic.

## What the $12/mo (1 vCPU / 2GB) Droplet can actually handle

- PocketBase (Go + SQLite) is built for this scale — published PocketBase benchmarks show low-thousands of simple read req/sec on modest hardware.
- The real ceiling isn't CPU, it's SQLite's single-writer model: reads are concurrent (WAL mode), but writes serialize. For CRUD-heavy admin work (creating records, updating statuses) this means writes queue up under heavy concurrent load — but at barangay staff scale (a handful of people submitting forms, not thousands), you'll never get close to that ceiling.
- Rough working-hours estimate: comfortably handles dozens of concurrent users and low hundreds of requests/minute without breaking a sweat. You'd need something like a citywide, multi-office rollout hitting it simultaneously before this Droplet becomes the bottleneck.

**Bottom line:** for a single barangay's working-hours traffic, the $12/mo Droplet is oversized relative to actual demand, not undersized. The roadmap item in the README ("Multi-barangay / centralized deployment") is the point where you'd want to revisit — likely moving to a managed Postgres-backed setup or horizontally scaling, not just bumping this Droplet's size.

---

# DigitalOcean Backend Deployment Plan

Plan for a Droplet running just the PocketBase backend, reachable via Cloudflare Tunnel (no public ports open) — matching the pattern already in `docs/DEPLOYMENT.md` but pointed at DigitalOcean.

No DO API access configured in this environment, so provisioning steps are commands to run manually (via the DO dashboard or `doctl` if you have a token). Pick up again once a Droplet exists and SSH access is available — or drive `doctl`/SSH directly (just confirm first, since creating a Droplet is billable).

## 1. Create the Droplet

Dashboard: **Create → Droplets**

| Setting | Recommendation |
|---|---|
| Image | Ubuntu 24.04 LTS |
| Plan | Basic, Regular, 1 vCPU / 2 GB / 50 GB SSD (~$12/mo) — PocketBase itself is light (`GOMEMLIMIT=512MiB`), but Docker + OS + cloudflared want headroom |
| Region | Closest to your users (e.g. `sgp1` for PH) |
| Auth | SSH key (not password) |
| Backups | Enable DO's weekly Droplet backups — belt-and-suspenders alongside PocketBase's own R2 backup already documented |

Or via CLI once `doctl auth init` is done:

```bash
doctl compute droplet create barangay-backend \
  --image ubuntu-24-04-x64 \
  --size s-1vcpu-2gb \
  --region sgp1 \
  --ssh-keys <your-ssh-key-fingerprint> \
  --enable-backups
```

## 2. Harden the server

```bash
ssh root@<droplet-ip>
adduser deploy && usermod -aG sudo deploy
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw enable
```

Because Cloudflare Tunnel makes an outbound-only connection, you never need to open 80/443/8090 — smallest possible attack surface.

## 3. Install Docker + cloudflared

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

## 4. Deploy PocketBase only

```bash
su - deploy
git clone https://github.com/<you>/barangayos.git
cd barangayos/backend
export PB_ENCRYPTION_KEY=$(openssl rand -hex 16)   # save this somewhere safe, it's needed to decrypt settings
docker compose up -d pocketbase        # only the pocketbase service — no nginx/frontend here
docker compose logs -f pocketbase      # confirm it starts clean
```

Persist `PB_ENCRYPTION_KEY` in `/etc/environment` so it survives reboots (per the existing docs' Linux note).

## 5. Cloudflare Tunnel → PocketBase directly

Tunnel ID: `35775adb-7d60-4cbf-92ad-d3a58839dd89`. Hostname: `adminbarangayos.vicentereyes.org`.

```bash
cloudflared tunnel login
cloudflared tunnel create barangay-backend
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: 35775adb-7d60-4cbf-92ad-d3a58839dd89
credentials-file: /home/deploy/.cloudflared/35775adb-7d60-4cbf-92ad-d3a58839dd89.json
ingress:
  - hostname: adminbarangayos.vicentereyes.org
    service: http://localhost:8090
  - service: http_status:404
```

```bash
cloudflared tunnel route dns 35775adb-7d60-4cbf-92ad-d3a58839dd89 adminbarangayos.vicentereyes.org
```

**Gotcha hit during deploy:** `sudo cloudflared service install <TUNNEL_TOKEN>` fails with `illegal base64 data` — that flag is only for dashboard-managed tunnels. This tunnel was created via CLI (locally-managed), so `service install` takes no token — pass `--config` explicitly instead so it doesn't get lost if `sudo` switches `$HOME`:

```bash
sudo cloudflared --config /home/deploy/.cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

## 6. Verify

```bash
curl http://localhost:8090/api/health                       # on the droplet
curl https://adminbarangayos.vicentereyes.org/api/health     # from anywhere
```

## 7. Point the frontend at it

Frontend is hosted on **Vercel** at `https://barangayos.vicentereyes.org`.

Vercel project → **Settings → Environment Variables** → add for Production:

```env
VITE_API_URL=https://adminbarangayos.vicentereyes.org
```

Since it's a build-time Vite var, trigger a redeploy after saving (Vercel doesn't hot-reload env vars into an existing build) — either **Deployments → ⋯ → Redeploy**, or push a commit.

## 8. Gotchas hit during first deploy

**Cloudflare challenge masquerading as a CORS error.** Login requests from the frontend failed with a browser CORS error (`No 'Access-Control-Allow-Origin' header`) plus a `404`. Real cause: Cloudflare's zone-wide **Security Level** and/or **Bot Fight Mode** was challenging API requests (`cf-mitigated: challenge`, a "Just a moment..." HTML page) before they reached PocketBase at all — a JS challenge page has no CORS headers, so the browser reports it as CORS instead of the actual block. `curl` from the droplet hit the same challenge, which is what ruled out anything PocketBase-side. Fix: Cloudflare dashboard → `vicentereyes.org` zone → **Security → Domain settings** → set **Security Level** to *Essentially Off* and turn off **Bot Fight Mode**. Confirmed via:
```bash
curl -i -X OPTIONS https://adminbarangayos.vicentereyes.org/api/collections/users/auth-with-password \
  -H "Origin: https://barangayos.vicentereyes.org" \
  -H "Access-Control-Request-Method: POST"
```
→ went from `403` (Cloudflare challenge HTML) to `204` with `access-control-allow-origin: *`.

**No default app user — must be created manually.** The `users` collection has `createRule: "@request.auth.role = \"admin\""`, so there's no public self-signup; a fresh deploy has zero rows in `users` even after migrations run cleanly. First login attempt failed with `400 Failed to authenticate`. Fix: log into the PocketBase Admin UI (`https://adminbarangayos.vicentereyes.org/_/`) as the superuser (created via `docker exec -it barangay-pocketbase /pb/pocketbase superuser upsert your@email.com yourpassword` per README), then **Collections → users → + New record** with `email`, `password`/`passwordConfirm`, and required `role` (admin/staff/viewer).

## 9. CI/CD — GitHub to DigitalOcean

Auto-deploy for the backend on push to `main` (only when `backend/**` changes), via `.github/workflows/deploy-backend.yml`.

**Why a self-hosted runner instead of GitHub-hosted + SSH:** the runner connects outbound to GitHub to pick up jobs, same pattern as `cloudflared` — no inbound ports to open on the droplet, and no SSH private key has to live in GitHub Secrets.

Along the way, fixed two gaps this depended on:
- `backend/docker-compose.yml` never actually passed `PB_ENCRYPTION_KEY` into the container (only `GOMEMLIMIT` was wired up) — added `PB_ENCRYPTION_KEY=${PB_ENCRYPTION_KEY:-}` to its `environment:` block.
- `.gitignore` only covered `.env.local`/`.env.production`, not a plain `backend/.env` — added `backend/.env` so the encryption key can never land in git history.

**One-time runner setup on the droplet:**
```bash
echo "PB_ENCRYPTION_KEY=<your-key>" > ~/barangayos/backend/.env   # docker compose auto-loads this

mkdir /opt/actions-runner && cd /opt/actions-runner
# download command from GitHub: repo → Settings → Actions → Runners → New self-hosted runner
./config.sh --url https://github.com/YOUR_USER/barangayos --token YOUR_TOKEN --labels barangay-backend
sudo ./svc.sh install
sudo ./svc.sh start
```

Once running, any push to `main` touching `backend/**` rebuilds and restarts just the `pocketbase` service and fails the job (with logs) if the health check doesn't pass within 30s. Manual fallback (`git pull && docker compose up -d --build pocketbase`) still documented in `docs/DEPLOYMENT.md` Option E.
