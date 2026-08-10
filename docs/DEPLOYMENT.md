# Deployment Guide

## Architecture Overview

The production deployment uses Docker with two containers:

```
                         ┌──────────────────────────────┐
                         │       Cloudflare Network      │
                         │  CDN - WAF - DDoS Protection  │
                         └──────┬───────────────────────┘
                                │
                     ┌──────────┴──────────┐
                     │  cloudflared tunnel  │
                     └──────────┬──────────┘
                                │
                     ┌──────────┴──────────┐
                     │  nginx (port 8080)   │
                     │  + HTTPS (8443)      │
                     │  SPA + API proxy     │
                     └──────────────────────┘
                                │ /api/*
                     ┌──────────┴──────────┐
                     │ PocketBase (port 8090)│
                     │   pb_data/ (volume)   │
                     └─────────────────────┘

LAN Users: http://192.168.x.x:8080 (through nginx, zero latency)
Remote:    https://app.yourdomain.com (via Cloudflare Tunnel → nginx, HTTPS)
Direct:    http://192.168.x.x:8090 (PocketBase admin UI, LAN only)
```

The nginx container serves the SPA and proxies `/api/*` and `/_/*` to PocketBase. The Cloudflare Tunnel exposes `localhost:8080` (nginx) to the internet. PocketBase port 8090 remains accessible on the LAN for direct admin access.

## Prerequisites

### Accounts

| Service | Purpose | Cost |
|---------|---------|------|
| [Cloudflare](https://www.cloudflare.com/) | DNS, Tunnel (cloudflared), WAF, CDN | Free tier |
| [GitHub](https://github.com/) | Code hosting, CI/CD | Free tier |

### Server

- A machine that stays on 24/7 (Windows or Linux)
- Router assigns a **static LAN IP** (DHCP reservation recommended)
- **Docker Desktop** (Windows) or **Docker Engine** (Linux) installed

### Software to Install

| Software | Purpose |
|----------|---------|
| [Docker](https://docs.docker.com/get-docker/) | Container runtime |
| [Node.js](https://nodejs.org) 20+ | Building the frontend |
| [Git](https://git-scm.com) | Pulling code updates |
| [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) | Cloudflare Tunnel client |

## Deployment Options

BarangayOS supports three deployment approaches:

| Approach | Best for | Public access |
|----------|----------|---------------|
| **Cloudflare Tunnel** (recommended) | Barangay offices with intermittent internet | HTTPS via tunnel |
| **Direct HTTPS** | Servers with a public IP | HTTPS via reverse proxy |
| **LAN-only** | Internal network, no internet needed | Local network only |

---

## Option A: Cloudflare Tunnel (Recommended)

### Step 1: Cloudflare Tunnel Setup

#### 1a. Add your domain to Cloudflare

1. Add your domain (e.g., `barangay.gov.ph`) to Cloudflare
2. Update the nameservers to point to Cloudflare's

#### 1b. Choose a subdomain

Pick a subdomain for the app, e.g., `records.barangay.gov.ph`.

#### 1c. Install cloudflared

**Windows:**

```powershell
# Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
# Extract cloudflared.exe to C:\Program Files (x86)\cloudflared\
```

**Linux:**

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

#### 1d. Authenticate

```bash
cloudflared tunnel login
```

This opens a browser — log in to Cloudflare and authorize your domain.

#### 1e. Create the tunnel

```bash
cloudflared tunnel create barangayos
```

Save the **tunnel UUID** and **credentials file path** printed by this command.

#### 1f. Configure ingress

**Windows:** `C:\ProgramData\cloudflared\config.yml`
**Linux:** `~/.cloudflared/config.yml`

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /path/to/<TUNNEL_UUID>.json
ingress:
  - hostname: records.barangay.gov.ph
    service: http://localhost:8080
  - service: http_status:404
```

#### 1g. Route DNS

```bash
cloudflared tunnel route dns barangayos records.barangay.gov.ph
```

#### 1h. Install as a service

The tunnel created in Step 1e is a **locally-managed** tunnel (credentials live in `config.yml`), not a dashboard-managed one — so `service install` takes no token here. Point it at the config file explicitly so it doesn't get lost if `service install` runs under a different user/HOME than the one that created it (e.g. via `sudo`):

**Windows** (admin PowerShell):

```powershell
cloudflared.exe --config C:\ProgramData\cloudflared\config.yml service install
Start-Service cloudflared
```

**Linux:**

```bash
sudo cloudflared --config ~/.cloudflared/config.yml service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

> A tunnel *token* (long base64 string) only exists for tunnels created via Cloudflare Dashboard → Zero Trust → Access → Tunnels. Passing the tunnel *ID/UUID* to `service install` instead of a token fails with `illegal base64 data` — if you created the tunnel with `cloudflared tunnel create` like above, skip the token entirely and use `--config` as shown.

#### 1i. Verify

Visit `https://records.barangay.gov.ph/` — you should see the app login page.

---

### Step 2: Docker Deployment

#### 2a. Build the frontend

```bash
cd frontend
npm run build
```

This produces static files in `frontend/dist/`.

#### 2b. Set the encryption key

PocketBase requires an encryption key for session management:

```bash
# Generate a key
openssl rand -hex 16
# Example output: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

**Windows (PowerShell):**

```powershell
$env:PB_ENCRYPTION_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
```

**Linux / macOS:**

```bash
export PB_ENCRYPTION_KEY="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
```

#### 2c. Start the stack

```bash
cd backend
docker compose up -d --build
```

This starts:
- **nginx** on port `8080` — serves the SPA and proxies API requests
- **PocketBase** on port `8090` — REST API and admin UI

#### 2d. Verify

| URL | What to check |
|-----|---------------|
| http://localhost:8080 | App login page loads |
| http://localhost:8090/_/ | PocketBase admin login |

---

### Step 3: Environment Configuration

Create `frontend/.env.production` (gitignored, stays on the server):

```env
VITE_API_URL=https://records.barangay.gov.ph
VITE_LOCAL_API_URL=http://192.168.1.100:8080
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
```

Replace `192.168.1.100` with the server's actual static LAN IP.

> **Important:** `VITE_API_URL` is the tunnel URL (HTTPS) so remote users get a secure connection. `VITE_LOCAL_API_URL` is the LAN IP so local users avoid tunnel latency. The app's smart URL resolver automatically selects the right one.

### About PB_ENCRYPTION_KEY

This environment variable is read by the PocketBase container at runtime. Set it in the environment before running `docker compose up`.

You can also set it permanently:

**Windows:** System Properties → Environment Variables → New → `PB_ENCRYPTION_KEY`

**Linux:** Add `export PB_ENCRYPTION_KEY="your-key"` to `/etc/environment` or the systemd service file.

> **Note:** `.env.production` and the encryption key are gitignored and never pushed to GitHub.

---

### Step 4: Auto-Deploy via GitHub Actions

#### 4a. Create a GitHub repository

1. Go to [GitHub](https://github.com/new)
2. Create a repository (e.g., `barangayos`)

#### 4b. Push the code

```bash
cd D:\BARANGAYCC\barangay-system
git remote add origin https://github.com/YOUR_USER/barangayos.git
git push -u origin main
```

#### 4c. Install a self-hosted GitHub runner

The self-hosted runner listens for pushes and runs the deploy script automatically.

1. GitHub repo → **Settings** → **Actions** → **Runners** → **New self-hosted runner**
2. Select your OS and follow the setup commands

**Windows:**

```powershell
mkdir C:\actions-runner; cd C:\actions-runner
# Download the runner package from GitHub (use URL from the instructions above)
.\config.cmd --url https://github.com/YOUR_USER/barangayos --token YOUR_TOKEN
.\run.cmd --startuptype windows_service
```

**Linux:**

```bash
mkdir /opt/actions-runner && cd /opt/actions-runner
# Download the runner package from GitHub (use URL from the instructions above)
./config.sh --url https://github.com/YOUR_USER/barangayos --token YOUR_TOKEN
sudo ./svc.sh install
sudo ./svc.sh start
```

#### 4d. How CI/CD works

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

| Stage | What it does |
|-------|-------------|
| **Lint** | oxlint code quality check |
| **Type Check** | TypeScript compiler check (`tsc -b`) |
| **Unit Tests** | Vitest test suite |
| **Build** | Production build via `npm run build` |
| **Security** | `npm audit` for dependency vulnerabilities |
| **E2E Tests** | Playwright browser tests |

> The self-hosted runner is optional — you can deploy manually instead.

---

### Step 5: Database Backup

Backups are configured through the PocketBase Admin UI — no separate backup tool needed.

#### 5a. Configure backups

1. Visit `http://localhost:8090/_/` and log in as admin
2. Go to **Settings** → **Backups**
3. Enable **Automatic backups**
4. Set interval to **5 minutes** (or your preferred interval)

#### 5b. Configure Cloudflare R2 (or any S3-compatible storage)

| Setting | Value |
|---------|-------|
| **Bucket** | `barangay-db-backup` |
| **Endpoint** | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| **Region** | `auto` |
| **Access Key ID** | Your R2 API token access key |
| **Secret Access Key** | Your R2 API token secret key |

**To get R2 credentials:**

1. Cloudflare Dashboard → R2 → Create Bucket (name: `barangay-db-backup`)
2. R2 → Account Details → Manage API Tokens
3. Create API Token → **Object Read & Write**
4. Scope to bucket `barangay-db-backup`
5. Copy the **Access Key ID** and **Secret Access Key**

#### 5c. Verify

Wait for the first backup cycle (up to 5 minutes), then check the R2 bucket to confirm backup files appear.

---

## Option B: Direct HTTPS (Without Cloudflare Tunnel)

If your server has a public IP address and you prefer not to use Cloudflare:

1. Set up a reverse proxy (nginx, Caddy, or Traefik) with Let's Encrypt for HTTPS
2. Point your domain's DNS A record to the server's public IP
3. Configure the reverse proxy to forward traffic to `http://localhost:8080`
4. Set `VITE_API_URL` to your domain (HTTPS)

**Example nginx reverse proxy config:**

```nginx
server {
    listen 443 ssl;
    server_name records.barangay.gov.ph;

    ssl_certificate /etc/letsencrypt/live/records.barangay.gov.ph/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/records.barangay.gov.ph/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Option C: LAN-Only Deployment

For barangay offices that don't need internet access:

1. Follow Step 2 (Docker Deployment) only
2. Access the app via the server's LAN IP: `http://192.168.x.x:8080`
3. No Cloudflare account or tunnel needed
4. No domain name needed

---

## Option D: LAN + HTTPS (For PWA / Installable App)

If you want the PWA install button to appear on LAN devices, the site must be served over HTTPS. This option adds HTTPS on the LAN without needing a domain or internet connection.

> **How it works:** The Docker image includes a self-signed placeholder certificate so nginx always starts with HTTPS enabled (port 8443). For proper PWA install without browser warnings, generate device-trusted certs using `mkcert` — the real certs silently override the placeholder via a Docker volume mount.

### Step 1: Generate trusted certificates

On the **server machine**, run the cert generation script:

```powershell
.\scripts\generate-certs.ps1
```

This script will:
- Install (or verify) `mkcert` — a zero-config local certificate authority
- Install the mkcert root CA on the server (one-time)
- Detect your server's LAN IP automatically
- Generate certificates for your LAN IP (`backend/certs/`)

If automatic IP detection fails, pass it manually:

```powershell
.\scripts\generate-certs.ps1 -LanIp 192.168.1.100
```

### Step 2: Enable the cert volume mount

Edit `backend/docker-compose.yml` and **uncomment** the certs volume line:

```yaml
frontend:
  # ...
  ports:
    - "8080:80"
    - "8443:443"
  volumes: [ "./certs:/etc/nginx/certs" ]    # ← uncomment this
```

### Step 3: Rebuild and restart

```powershell
cd backend
docker compose up -d --build
```

### Step 4: Access via HTTPS

Open `https://<SERVER_LAN_IP>:8443` on any device.

- **Same device as server** → cert is already trusted (mkcert installed the root CA)
- **Other LAN devices** → visit the URL once and accept the certificate warning, OR install the mkcert root CA on each device:

  | Device | How to trust |
  |--------|-------------|
  | Windows | `mkcert -install` (then restart browser) |
  | macOS   | `mkcert -install` |
  | Android | Settings → Security → CA certificate → Install the `rootCA.pem` from the server |
  | iOS     | Share `rootCA.pem` via AirDrop, then Settings → Profile → Install |

  > The mkcert root CA file is at: `$env:LOCALAPPDATA\mkcert\rootCA.pem` (Windows) or `~/.local/share/mkcert/rootCA.pem` (macOS/Linux)

Once the cert is trusted, the PWA install button will appear in the sidebar.

### Architecture diagram

```
                            ┌──────────────────────────────┐
                            │         LAN Network          │
                            │  192.168.x.0/24              │
                            └──────┬───────────────────────┘
                                   │
                        ┌──────────┴──────────┐
                        │   nginx (docker)     │
                        │   :80  (HTTP)        │
                        │   :443 (HTTPS, mkcert)│
                        └──────────┬──────────┘
                                   │ /api/*
                        ┌──────────┴──────────┐
                        │ PocketBase (port 8090)│
                        └─────────────────────┘

  HTTP:   http://192.168.x.x:8080     (no PWA, no install)
  HTTPS:  https://192.168.x.x:8443    (PWA installable)
```

---

## Option E: DigitalOcean Droplet (Backend Only)

Runs just the PocketBase backend on a DigitalOcean Droplet, reachable via Cloudflare Tunnel. No inbound ports are opened on the Droplet — the tunnel makes an outbound-only connection — so this is one of the smallest attack surfaces available. The frontend is built and hosted separately (e.g. Cloudflare Pages, another Droplet, or LAN as in Option A) and simply points `VITE_API_URL` at the tunnel hostname below.

### Step 1: Create the Droplet

Dashboard: **Create → Droplets**

| Setting | Recommendation |
|---|---|
| Image | Ubuntu 24.04 LTS |
| Plan | Basic, Regular, **1 vCPU / 2 GB / 50 GB SSD** (~$12/mo) — PocketBase itself is light (`GOMEMLIMIT=512MiB`), but Docker + OS + cloudflared want headroom |
| Region | Closest to your users |
| Auth | SSH key (not password) |
| Backups | Enable DO's Droplet backups as a second layer alongside PocketBase's own R2 backups (Step 5 below) |

Or via `doctl`:

```bash
doctl compute droplet create barangay-backend \
  --image ubuntu-24-04-x64 \
  --size s-1vcpu-2gb \
  --region sgp1 \
  --ssh-keys <your-ssh-key-fingerprint> \
  --enable-backups
```

### Step 2: Harden the server

```bash
ssh root@<droplet-ip>
adduser deploy && usermod -aG sudo deploy
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw enable
```

Because Cloudflare Tunnel connects outbound, ports 80/443/8090 never need to be opened.

### Step 3: Install Docker and cloudflared

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

### Step 4: Deploy PocketBase

```bash
su - deploy
git clone https://github.com/YOUR_USER/barangayos.git
cd barangayos/backend
export PB_ENCRYPTION_KEY=$(openssl rand -hex 16)   # save this value securely, it decrypts settings
docker compose up -d pocketbase        # only the pocketbase service — no nginx/frontend here
docker compose logs -f pocketbase      # confirm a clean start
```

Persist the encryption key across reboots by adding it to `/etc/environment`:

```bash
echo "PB_ENCRYPTION_KEY=your-32-char-hex-key" | sudo tee -a /etc/environment
```

### Step 5: Cloudflare Tunnel to PocketBase

Same flow as Option A, Step 1, but ingress points directly at PocketBase's port instead of nginx:

```bash
cloudflared tunnel login
cloudflared tunnel create barangay-backend
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/deploy/.cloudflared/<TUNNEL_UUID>.json
ingress:
  - hostname: api.records.barangay.gov.ph
    service: http://localhost:8090
  - service: http_status:404
```

```bash
cloudflared tunnel route dns barangay-backend api.records.barangay.gov.ph
```

Before installing the service, double-check `credentials-file:` in `config.yml` points at the actual file `cloudflared tunnel create` wrote (e.g. `/home/deploy/.cloudflared/<TUNNEL_UUID>.json`), not a literal placeholder.

This is a **locally-managed** tunnel (created via CLI above), so `service install` takes no token — pass `--config` explicitly instead, so it doesn't get lost if `sudo` switches `$HOME` away from the user that created the tunnel:

```bash
sudo cloudflared --config /home/deploy/.cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

> Passing the tunnel ID/UUID as a token (`cloudflared service install <TUNNEL_UUID>`) fails with `illegal base64 data` — a token only exists for tunnels created via the Zero Trust dashboard.

### Step 6: Verify

```bash
curl http://localhost:8090/api/health                       # on the droplet
curl https://api.records.barangay.gov.ph/api/health          # from anywhere
```

### Step 7: Point the frontend at it

Wherever the frontend is built or hosted, set:

```env
VITE_API_URL=https://api.records.barangay.gov.ph
```

### Updating

**Automatic (recommended):** a self-hosted GitHub Actions runner on the Droplet picks up pushes to `main` that touch `backend/**` and rebuilds/restarts the `pocketbase` service — see `.github/workflows/deploy-backend.yml`. Set it up once:

```bash
mkdir /opt/actions-runner && cd /opt/actions-runner
# Download the runner package from GitHub — Settings → Actions → Runners → New self-hosted runner
./config.sh --url https://github.com/YOUR_USER/barangayos --token YOUR_TOKEN --labels barangay-backend
sudo ./svc.sh install
sudo ./svc.sh start
```

Because the runner connects outbound to GitHub (same as `cloudflared`), no inbound ports or SSH secrets are needed — the deploy key/secrets never leave the Droplet. Also create `backend/.env` on the Droplet (gitignored, never committed) so `docker compose` picks up the encryption key on every automated rebuild:

```bash
echo "PB_ENCRYPTION_KEY=your-32-char-hex-key" > ~/barangayos/backend/.env
```

**Manual fallback:**

```bash
cd barangayos/backend
git pull
docker compose up -d --build pocketbase
```

### Database backups

Configure R2 backups from the PocketBase Admin UI exactly as in Option A, Step 5 — this works the same regardless of where the container is hosted.

---

## Troubleshooting

### View container logs

```bash
# All containers
docker compose logs

# Specific service
docker compose logs nginx
docker compose logs pocketbase

# Follow logs in real-time
docker compose logs -f
```

### Restart containers

```bash
docker compose restart nginx    # Restart nginx only
docker compose restart pocketbase  # Restart PocketBase only
docker compose restart           # Restart all
```

### Rebuild and restart

```bash
docker compose up -d --build
```

### Check container status

```bash
docker compose ps
```

### Login shows "Something went wrong"

- Open DevTools → Network tab → check which URL the POST request goes to
- If it's the tunnel URL but you're on LAN, the local IP in `.env.production` might be wrong
- Run `ipconfig` (Windows) or `ip a` (Linux) on the server, check the IPv4 address, and update `VITE_LOCAL_API_URL`

### Tunnel returns 503

- Check cloudflared is running: `Get-Service cloudflared` (Windows) or `systemctl status cloudflared` (Linux)
- Check the tunnel status in the Cloudflare dashboard
- Verify `config.yml` has the correct tunnel UUID and hostname, pointing to `localhost:8080`
- Make sure Docker containers are running: `docker compose ps`

### Build succeeds but changes don't appear

- Hard-refresh the browser (Ctrl+Shift+R) to bypass cache
- Verify the new container image was built: `docker compose up -d --build`
- Check that nginx is serving the updated `dist/` files

### PocketBase crashes on startup

- Check the PocketBase logs: `docker compose logs pocketbase`
- The `pb_data/` directory may be corrupted. Stop the container, back up `pb_data/`, delete it, and restart (migrations will re-run)

---

## Quick Reference

### Build and deploy

```bash
cd frontend && npm run build
export PB_ENCRYPTION_KEY="your-32-char-hex-key"  # Linux
# $env:PB_ENCRYPTION_KEY = "your-key"            # Windows
cd backend && docker compose up -d --build
```

### Deploy via Git push (self-hosted runner)

```bash
git add .
git commit -m "feat: add my changes"
git push origin main
```

### Check server health

```bash
curl http://localhost:8080/api/health
curl https://records.barangay.gov.ph/api/health
```

### Generate LAN HTTPS certificates

```powershell
.\scripts\generate-certs.ps1
```

After generating certs, uncomment `volumes: [ "./certs:/etc/nginx/certs" ]` in `backend/docker-compose.yml` and rebuild:

```bash
cd backend && docker compose up -d --build
```

### Generate square PWA icons

If you replace `public/icon-logo.png` with a custom logo, regenerate the square icons:

```bash
cd frontend && node scripts/generate-icons.cjs
```

### View logs

```bash
docker compose logs -f
```

### Restart services

```bash
docker compose restart
```

---

## Pre-deployment Checklist

Before deploying, always verify:

```bash
cd frontend
npm run lint       # No lint errors
npx tsc -b         # No type errors
npm run test       # All tests pass
npm run build      # Build succeeds
```

All four should pass cleanly.
