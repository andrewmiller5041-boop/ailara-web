// ── AILARA API Proxy — Vercel Serverless Function ─────────────────────────
// Keeps your Anthropic API key server-side, never exposed to the browser.
// Deploy: set ANTHROPIC_API_KEY in Vercel environment variables.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Allowed models — prevent substitution attacks
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-20250514',
]);

// Your deployed Vercel domains — update after deployment
const ALLOWED_ORIGINS = [
  'https://ailara.vercel.app',        // ← update to your actual domain
  'https://ailara.app',               // ← your custom domain if you have one
  'http://localhost:3000',            // local dev
  'http://localhost:5173',            // Vite dev
];

export default async function handler(req, res) {
  // ── CORS ───────────────────────────────────────────────────────────────
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Validate API key ───────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // ── Validate request ───────────────────────────────────────────────────
  const { model, messages, max_tokens, system, tools } = req.body || {};

  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing required fields: model, messages' });
  }
  if (!ALLOWED_MODELS.has(model)) {
    return res.status(400).json({ error: `Model '${model}' not permitted` });
  }
  if (max_tokens > 8000) {
    return res.status(400).json({ error: 'max_tokens cannot exceed 8000' });
  }
  if (messages.length > 100) {
    return res.status(400).json({ error: 'Too many messages in context' });
  }

  // ── Rate limiting (basic — use Upstash Redis for production) ──────────
  // Vercel's free tier has no built-in rate limiting per user.
  // For basic protection, the daily limits in the app itself are the main guard.
  // For production, add: npm install @upstash/ratelimit @upstash/redis

  // ── Forward to Anthropic ───────────────────────────────────────────────
  try {
    const body = { model, messages, max_tokens };
    if (system)  body.system = system;
    if (tools)   body.tools  = tools;

    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // ── Cost logging ─────────────────────────────────────────────────────
    if (data.usage) {
      const { input_tokens: i = 0, output_tokens: o = 0,
              cache_read_input_tokens: cr = 0,
              cache_creation_input_tokens: cw = 0 } = data.usage;
      const cost = (i * 3 + o * 15 + cr * 0.3 + cw * 3.75) / 1_000_000;
      console.log(`[AILARA] model:${model} in:${i} out:${o} cr:${cr} cw:${cw} $${cost.toFixed(5)}`);
    }

    return res.status(response.status).json(data);

  } catch (err) {
    console.error('[AILARA proxy error]', err.message);
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
}
