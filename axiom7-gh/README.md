# AXIOM-7 // Sovereign Bionic Intelligence

Bionic AI interface with Stripe paywall, deployed on GitHub Pages with a Cloudflare Worker backend.

## Architecture

```
GitHub Pages (static)          Cloudflare Worker (serverless)       Stripe
  index.html  ─────────────▶  /api/create-checkout  ──────────▶  Checkout
  app.html    ─────────────▶  /api/verify-payment   ◀──────────  Webhook
                              /api/chat              ──────────▶  Anthropic API
                              /api/validate
```

## Deploy in 4 steps

### Step 1 — GitHub Pages

```bash
# Create repo on GitHub named: axiom7  (or any name)
git init
git add .
git commit -m "AXIOM-7 // initial deployment"
git remote add origin https://github.com/YOUR_USERNAME/axiom7.git
git push -u origin main
```

Enable Pages:
- Repo Settings → Pages → Source: **GitHub Actions**
- Wait ~60 seconds → live at `https://YOUR_USERNAME.github.io/axiom7`

### Step 2 — Cloudflare Worker

```bash
# Install wrangler
npm install -g wrangler
wrangler login

# Set your site URL in wrangler.toml first, then deploy:
wrangler deploy

# Set secrets (never hardcode these):
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put TOKEN_SECRET        # any random string: openssl rand -hex 32
wrangler secret put PRICE_ID            # from Stripe dashboard
```

Your worker URL will be: `https://axiom7-gateway.YOUR_SUBDOMAIN.workers.dev`

### Step 3 — Update config in HTML files

In both `index.html` and `app.html`, replace:
```js
const WORKER_URL = 'https://axiom7-gateway.YOUR_SUBDOMAIN.workers.dev';
```

### Step 4 — Stripe setup

1. Create account at stripe.com
2. Dashboard → Products → Create product
   - Name: "AXIOM-7 Operative Access"
   - Price: $12 / one-time
   - Copy the Price ID (starts with `price_`)
3. Set it as the `PRICE_ID` secret in Cloudflare
4. Test mode first — use card `4242 4242 4242 4242`

## Access modes

| Mode | How | Cost |
|------|-----|------|
| Free trial | 3 messages, session only | Free |
| Operative | Stripe payment, 30-day token | $12 |
| BYOK | User provides own Anthropic key | Free (they pay Anthropic) |

## Free tier in worker.js

The worker currently accepts `Bearer free-trial` for the free tier.
To add rate limiting per IP, use Cloudflare KV:

```bash
wrangler kv:namespace create "FREE_TIER_LIMITS"
# Add the namespace ID to wrangler.toml under [[kv_namespaces]]
```

## Local dev

```bash
# Serve locally:
python3 -m http.server 8080
# open http://localhost:8080

# Worker dev:
wrangler dev
```
