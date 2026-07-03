# FenceVisionPro

B2B2C platform that lets your US wholesalers produce accurate, visually-rendered fence quotations in minutes instead of weeks.

## Goals
- Reduce quote-to-order cycle from 2–3 weeks to **7 working days**.
- Wholesalers log in to upload a house layout, draw the fence on it, pick a design, and instantly get a rendered preview and itemised quotation.
- Customer receives a public approval link with a quote and an e-signature field.
- All product data, pricing, and templates are managed centrally with per-wholesaler overrides.

## Stack
- **Frontend**: Vite + React + TypeScript + Tailwind, served by nginx in production
- **Backend**: NestJS + TypeScript, JWT auth, Prisma ORM
- **Database**: PostgreSQL 16
- **Storage**: `./data` mounted as a volume – holds uploaded plans, generated renders, PDFs, signatures, and design overlay assets
- **Container**: docker compose

## Repo layout
```
.
├── backend/        NestJS API + Prisma
├── frontend/       Vite/React/Tailwind SPA
├── data/           Persistent uploads & generated assets
│   └── overlays/   Design overlay PNGs (sample assets checked in)
└── docker-compose.yml
```

## Quick start

```bash
# 1. Start everything (db + backend + frontend)
docker compose up -d --build

# 2. Apply schema (runs automatically on backend boot) and seed once
cd backend
npm install
DATABASE_URL=postgresql://fence:fence@localhost:5432/fencevisionpro npx prisma migrate deploy
DATABASE_URL=postgresql://fence:fence@localhost:5432/fencevisionpro npx prisma db seed
cd ..

# 3. Open
#    App:  http://localhost:12889
#    API:  http://localhost:12888
```

> The seed script is a one-time bootstrap that needs the TypeScript toolchain
> (which is on your host, not in the slim production image). It targets the
> Postgres port `5432` exposed by docker compose on the host loopback.

Seeded logins:
- **Admin** (you): `admin@fencevisionpro.local` / `admin1234`
- **Wholesaler owner**: `owner@demofence.example` / `owner1234`

## Core flows

### Wholesaler onboarding
1. Admin logs in, goes to **Wholesalers**, creates a new tenant.
2. Owner receives login + password, signs in to start creating quotes.

### Quote lifecycle
1. Wholesaler creates a new quote.
2. Uploads a floor plan and **calibrates** the scale (click two reference points, enter real distance).
3. **Draws** fence segments on the plan – the total length is computed live.
4. Picks a design + primary product, and uploads a house photo for the **client-side preview**. The server also composites a top-down render via the `/render` endpoint.
5. Hits **Save & send** – the system derives line items, computes totals, and emits a public approval link.
6. Customer opens the link, reviews the render + line items, signs, and approves.
7. Wholesaler generates the PDF and ships the order.

## API surface (selected)
| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Email + password → JWT |
| `GET`  | `/auth/me` | Current user |
| `GET`  | `/wholesalers` | Admin only |
| `POST` | `/wholesalers` | Admin only – onboard a new wholesaler |
| `POST` | `/wholesalers/:id/staff` | Owner adds a staff sub-user |
| `GET`  | `/products` | Catalog with effective price for current tenant |
| `POST` | `/products` | Admin – add a product |
| `POST` | `/products/:id/override/:wholesalerId` | Admin – set a per-wholesaler price |
| `GET`  | `/designs` | Design library |
| `POST` | `/quotes/upload-floorplan` | Multipart upload of a plan/photo |
| `POST` | `/render` | Server-side composite (top-down) |
| `POST` | `/quotes` | Create quote – derives line items from fence segments |
| `GET`  | `/quotes/:id` | Get a quote |
| `PUT`  | `/quotes/:id/status` | Update status (`DRAFT`/`SENT`/`APPROVED`/...) |
| `GET`  | `/quotes/:id/pdf` | Generate and return the PDF URL |
| `GET`  | `/public/quotes/:id` | Customer-facing view (no auth) |
| `POST` | `/public/quotes/:id/approve` | Customer e-signature + approval |
| `POST` | `/auth/change-password` | Self-service password change (requires current password) |
| `POST` | `/wholesalers/:id/staff/:staffId/reset-password` | Owner resets a staff password |
| `POST` | `/wholesalers/:id/staff/:staffId/deactivate` | Owner deactivates a staff user |
| `POST` | `/wholesalers/:id/staff/:staffId/reactivate` | Owner reactivates a staff user |
| `PATCH` | `/quotes/:id` | Partial update of a DRAFT (or notes/renderUrl on a SENT quote) |
| `DELETE` | `/quotes/:id` | Delete a DRAFT quote |
| `POST` | `/quotes/:id/clone` | Clone any quote as a new DRAFT |
| `POST` | `/quotes/:id/snapshot` | Persist a client-captured 3D frame as the quote's render |
| `POST` | `/quotes/expire-overdue` | Mark all SENT quotes with past `validUntil` as `EXPIRED` (idempotent, also runs every 5 min) |
| `DELETE` | `/products/:id/override/:wholesalerId` | Admin – clear a per-wholesaler price override |
| `POST` | `/ai/render-image` | Photorealistic fence image (server-side) |
| `POST` | `/ai/generate-3d` | Self-contained three.js scene (LLM-generated) |
| `GET` | `/ai/status` | Is AI enabled? Which models? |

## AI features

The backend integrates with an OpenAI-compatible image / chat endpoint to
power two extra visualisation features. The credentials live in
`backend/.env` (gitignored) - see `backend/.env.example` for the template.

| Env var | Default | Purpose |
| --- | --- | --- |
| `AI_ENABLED` | `true` | Master switch |
| `AI_BASE_URL` | (empty) | OpenAI-compatible base URL (e.g. `http://host:port/v1`) |
| `AI_API_KEY` | (empty) | Bearer token for the AI service |
| `AI_IMAGE_MODEL` | `z-image-turbo` | Model for `/ai/render-image` |
| `AI_CODE_MODEL` | `mimo-v25-pro` | Model for `/ai/generate-3d` |
| `AI_IMAGE_SIZE` | `1024x1024` | Output size for image gen |
| `AI_IMAGE_STEPS` | `9` | Inference steps for image gen |

### Endpoints

- `GET  /ai/status` - returns whether AI is enabled and the model names
- `POST /ai/render-image` - body `{ style, color, heightFt, surroundings? }` -> `{ url }` with a photorealistic PNG stored in `/static/renders/`
- `POST /ai/generate-3d`  - body `{ style, color, heightFt, panelCount?, gateCount? }` -> `{ code, model }` with a self-contained three.js IIFE

### Where the AI shows up in the UI

- **NewQuotePage** - "Design preview" section gains two buttons: "✨ AI render image" and "🧊 Generate 3D scene". The AI image is automatically used as the quote's preview when the user saves.
- **QuoteDetailPage** - "AI visualisation" section lets the wholesaler re-run the AI at any time to get a fresh render for the customer.

### Security

The three.js code is generated by an LLM and is therefore untrusted. The
frontend renders it inside a **sandboxed iframe** (`sandbox="allow-scripts"`
with no `allow-same-origin`) so the generated code:

- cannot access the host page's DOM, localStorage, or cookies
- cannot make authenticated requests back to our API
- cannot navigate the parent window

THREE is loaded from a CDN **inside** the iframe (not in the host page),
so the only global the generated code can see is THREE itself.

The image generation runs **server-side** and writes the result into
`./data/renders/`, which is served back to the browser as a static
asset. The API key never reaches the client.

## Deployment

This is a standard `docker compose` stack that runs anywhere Docker 20+ does.
The image builds are reproducible; secrets live in `backend/.env` (gitignored)
and are passed in at runtime via `env_file` - they are never baked into the
image.

### 1. One-time setup on the server

```bash
# Install Docker + compose plugin (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in

# Clone the repo
git clone <your-git-url> fencevisionpro
cd fencevisionpro

# Create the real env file
cp backend/.env.example backend/.env
$EDITOR backend/.env          # set DATABASE_URL, JWT_SECRET, AI_BASE_URL, AI_API_KEY, ...
chmod 600 backend/.env        # protect the API key from other users
```

The only env vars you **must** set:

| Variable | Why |
| --- | --- |
| `JWT_SECRET` | Random 64-char string - `openssl rand -hex 32` |
| `AI_BASE_URL` | Your OpenAI-compatible image / chat endpoint |
| `AI_API_KEY` | Bearer token for that endpoint |
| (other AI_* vars) | Defaults are fine; tweak only if your model differs |

> The seed script (`prisma/seed.ts`) must run once on the host because the
> production image has no TypeScript toolchain. Run it after the first
> `docker compose up -d`:
>
> ```bash
> cd backend
> npm install
> DATABASE_URL=postgresql://fence:fence@localhost:5432/fencevisionpro npx prisma migrate deploy
> DATABASE_URL=postgresql://fence:fence@localhost:5432/fencevisionpro npx prisma db seed
> cd ..
> ```

### 2. Start the stack

```bash
docker compose up -d --build
docker compose ps      # all three services should be 'Up' / 'healthy'
```

By default the stack listens on:

- `http://<server>:12888` - backend (NestJS API)
- `http://<server>:12889` - frontend (Vite SPA served by nginx)
- `localhost:5432`      - Postgres (only bound to loopback; change in compose if you need remote psql)

### 3. Put it behind HTTPS (recommended)

The simplest path is **Caddy** as a reverse proxy - automatic Let's Encrypt
certificates, zero config. Add a `Caddyfile` to the repo:

```caddyfile
app.fencevisionpro.com {
    reverse_proxy localhost:12889
}

api.fencevisionpro.com {
    reverse_proxy localhost:12888
}
```

Then on the server:

```bash
sudo apt install -y caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Point your DNS A records at the server and Caddy will fetch certs
automatically. Open `https://app.fencevisionpro.com` in a browser.

If you'd rather stay on the compose-managed ports, change the host-side
port mapping in `docker-compose.yml` to `80:80` and `443:3000` and run
nginx in front - but Caddy is a lot less ceremony.

### 4. Backups

Two things need to be backed up:

```bash
# Postgres database
docker exec fvp_db pg_dump -U fence fencevisionpro | gzip > backup-$(date +%F).sql.gz

# Uploaded plans / generated renders / PDFs / signatures
tar -czf data-$(date +%F).tar.gz data/uploads data/renders data/pdfs data/signatures
```

Schedule both with `cron` (daily is plenty for a v1). Restore with
`docker exec -i fvp_db psql -U fence fencevisionpro < backup.sql.gz` and
unpacking the tarball.

### 5. Updating

```bash
git pull
docker compose build
docker compose up -d       # picks up new images, runs migrations
```

Rolling back: `git checkout <prev-tag> && docker compose up -d --build`.

### 6. Where to host

This stack is small and runs fine on a $5-10/month VPS (1 vCPU, 1-2 GB RAM
is plenty for the v1 workload). Tested concepts:

- **Hetzner** (CX22 - €4.5/mo) - cheapest, EU/US
- **DigitalOcean** (Basic Droplet - $6/mo) - simple, US/EU/SG
- **AWS Lightsail** ($5/mo) - if you're already in AWS
- **Vultr**, **Linode** - similar tier

Pick a region close to your US wholesalers for the lowest latency
(Ashburn, NY or SFO are good choices).

## Architectural seams (where to extend later)

The MVP is intentionally **simple in three places** that are obvious upgrade paths:

1. **Floor plan → fence segments**
   - v1: interactive canvas (calibrate + click-to-draw).
   - Swap point: `PlanEditor.tsx` + a new `POST /quotes/auto-detect` endpoint if you add an AI model later.

2. **Design preview (rendered image)**
   - v1: client-side `<canvas>` composite + server-side top-down `sharp` composite.
   - Swap point: `DesignPreview.tsx` (client) and `RenderService.compositeTopDown` (server). Both can be replaced with a 3D pipeline (Three.js / Blender) or an external AI image service without touching the rest of the code.

3. **Customer approval**
   - v1: signed URL (UUID) + canvas signature.
   - Swap point: add signed-expiry tokens, or integrate DocuSign/HelloSign for stronger legal weight.

## Development (without Docker)

```bash
# Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev

# Frontend (in another terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/static` to `http://localhost:12888`.

## Data model (summary)
- `Wholesaler` (tenant)
- `User` (ADMIN, WHOLESALER_OWNER, WHOLESALER_STAFF) – staff are scoped to a wholesaler
- `Product` – global catalog with optional `PriceOverride` per wholesaler
- `Design` – name, style, overlay URL, config; linked to `Product`s via `DesignProduct` (coverage in meters)
- `QuoteTemplate` – per-wholesaler header/footer/terms
- `Quote` – customer info, fence segments (in meters), selected design, totals, status
- `QuoteLineItem` – derived from segments + product pricing

## Roadmap
- [ ] Replace canvas drawing with auto-detect via a CV/ML model
- [ ] Replace 2D preview with a 3D / AI renderer
- [ ] Wholesaler template editor (logo, accent color, terms)
- [ ] Email/SMS delivery of approval links
- [ ] Multi-currency support
- [ ] Inventory / lead-time integration
