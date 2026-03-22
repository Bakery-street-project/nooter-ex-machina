// ─────────────────────────────────────────────────────────────
// AXIOM-7 Cloudflare Worker — Sovereign API Gateway
// Deploy: wrangler deploy
// Env vars required (set in Cloudflare dashboard):
//   ANTHROPIC_API_KEY
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   TOKEN_SECRET        (any random 32+ char string)
//   PRICE_ID            (your Stripe Price ID, e.g. price_xxx)
//   SITE_URL            (https://yourusername.github.io/axiom7)
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Simple HMAC-SHA256 token (no JWT library needed) ──────────
async function signToken(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const data = enc.encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return btoa(JSON.stringify(payload)) + '.' + b64;
}

async function verifyToken(token, secret) {
  try {
    const [payloadB64, sig] = token.split('.');
    const payload = JSON.parse(atob(payloadB64));
    const expected = await signToken(payload, secret);
    if (expected !== token) return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ── Route handler ─────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // POST /api/create-checkout
    if (path === '/api/create-checkout' && request.method === 'POST') {
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'payment_method_types[]': 'card',
          'line_items[0][price]': env.PRICE_ID,
          'line_items[0][quantity]': '1',
          mode: 'payment',
          success_url: `${env.SITE_URL}/app.html?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${env.SITE_URL}/?cancelled=1`,
        }),
      });
      const session = await res.json();
      if (!session.url) return json({ error: 'Stripe error', detail: session }, 500);
      return json({ url: session.url });
    }

    // POST /api/verify-payment  { session_id }
    if (path === '/api/verify-payment' && request.method === 'POST') {
      const { session_id } = await request.json();
      if (!session_id) return json({ error: 'Missing session_id' }, 400);

      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      const session = await res.json();

      if (session.payment_status !== 'paid') {
        return json({ error: 'Payment not completed' }, 402);
      }

      // Issue access token valid for 30 days
      const token = await signToken({
        sub: session.customer_details?.email || session.id,
        session: session_id,
        plan: 'sovereign',
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }, env.TOKEN_SECRET);

      return json({ token, email: session.customer_details?.email });
    }

    // POST /api/chat  (protected)
    if (path === '/api/chat' && request.method === 'POST') {
      // Verify bearer token
      const auth = request.headers.get('Authorization') || '';
      const rawToken = auth.replace('Bearer ', '');
      const payload = await verifyToken(rawToken, env.TOKEN_SECRET);
      if (!payload) return json({ error: 'Unauthorized — access token invalid or expired' }, 401);

      const body = await request.json();
      const { messages, system } = body;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system,
          messages,
        }),
      });

      const data = await res.json();
      return json(data);
    }

    // GET /api/validate  (check token still valid)
    if (path === '/api/validate' && request.method === 'GET') {
      const auth = request.headers.get('Authorization') || '';
      const rawToken = auth.replace('Bearer ', '');
      const payload = await verifyToken(rawToken, env.TOKEN_SECRET);
      if (!payload) return json({ valid: false }, 401);
      return json({ valid: true, plan: payload.plan, exp: payload.exp });
    }

    return json({ error: 'Not found' }, 404);
  }
};
