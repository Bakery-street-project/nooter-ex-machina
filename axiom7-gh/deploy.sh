#!/bin/bash
# ─────────────────────────────────────────────
# AXIOM-7 // Full Sovereign Deployment Script
# Run: chmod +x deploy.sh && ./deploy.sh
# ─────────────────────────────────────────────
set -e

echo "▸ AXIOM-7 DEPLOYMENT SEQUENCE INITIATED"
echo ""

# ── Prompt for config ──
read -p "GitHub username: " GH_USER
read -p "GitHub repo name [axiom7]: " GH_REPO
GH_REPO=${GH_REPO:-axiom7}
read -p "Cloudflare Worker subdomain (e.g. terminal221b): " CF_SUB

WORKER_URL="https://axiom7-gateway.${CF_SUB}.workers.dev"
SITE_URL="https://${GH_USER}.github.io/${GH_REPO}"

echo ""
echo "▸ Site URL: $SITE_URL"
echo "▸ Worker URL: $WORKER_URL"
echo ""

# ── Patch WORKER_URL into HTML files ──
sed -i "s|https://axiom7-gateway.YOUR_SUBDOMAIN.workers.dev|${WORKER_URL}|g" index.html app.html
sed -i "s|https://YOUR_USERNAME.github.io/axiom7|${SITE_URL}|g" wrangler.toml
echo "✓ URLs patched in HTML files"

# ── Git init and push ──
if [ ! -d .git ]; then
  git init
  git branch -M main
fi

git add -A
git commit -m "AXIOM-7 // sovereign deployment $(date +%Y%m%d-%H%M)"

echo ""
echo "▸ Create a GitHub repo named '${GH_REPO}' at https://github.com/new"
echo "  then press ENTER to continue..."
read

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${GH_USER}/${GH_REPO}.git"
git push -u origin main

echo ""
echo "✓ GitHub push complete"
echo "▸ Enable Pages: repo Settings → Pages → Source: GitHub Actions"
echo ""

# ── Cloudflare Worker ──
echo "▸ Checking wrangler..."
if ! command -v wrangler &>/dev/null; then
  echo "Installing wrangler..."
  npm install -g wrangler
fi

echo ""
echo "▸ Deploying Cloudflare Worker..."
wrangler deploy

echo ""
echo "▸ Setting secrets — you'll be prompted for each value:"
echo ""
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put PRICE_ID

# Generate a random token secret automatically
TOKEN_SECRET=$(openssl rand -hex 32)
echo "$TOKEN_SECRET" | wrangler secret put TOKEN_SECRET
echo "✓ TOKEN_SECRET auto-generated and set"

echo ""
echo "═══════════════════════════════════════"
echo "✓ AXIOM-7 DEPLOYMENT COMPLETE"
echo ""
echo "  Live URL:    $SITE_URL"
echo "  Worker URL:  $WORKER_URL"
echo ""
echo "  Next: Go to Stripe → Create product → $12 one-time"
echo "        wrangler secret put PRICE_ID"
echo "═══════════════════════════════════════"
