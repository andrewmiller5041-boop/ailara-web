// ── AILARA API Proxy — Vercel Serverless Function ─────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
 
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-20250514',
]);
 
// !! UPDATE THIS to match your actual Vercel URL !!
const ALLOWED_ORIGINS = [
  'https://ailara-web.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];
 
export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────────────────
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin);
 
  // Set CORS headers — allow the request even if origin check fails
  // so we can return a meaningful error instead of a silent failure
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, anthropic-beta');
  res.setHeader('Vary', 'Origin');
 
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
 
  // ── API key ──────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' });
 
  // ── Validate ─────────────────────────────────────────────────────────────
  const { model, messages, max_tokens, system, tools } = req.body || {};
 
  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing required fields: model, messages' });
  }
  if (!ALLOWED_MODELS.has(model)) {
    return res.status(400).json({ error: `Model not permitted: ${model}` });
  }
  if ((max_tokens || 0) > 8000) {
    return res.status(400).json({ error: 'max_tokens cannot exceed 8000' });
  }
 
  // ── Forward to Anthropic ─────────────────────────────────────────────────
  try {
    const body = { model, messages, max_tokens: max_tokens || 1000 };
    if (system) body.system = system;
    if (tools)  body.tools  = tools;
 
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
      },
      body: JSON.stringify(body),
    });
 
    const data = await response.json();
 
    // Log cost info
    if (data.usage) {
      const { input_tokens: i=0, output_tokens: o=0,
              cache_read_input_tokens: cr=0,
              cache_creation_input_tokens: cw=0 } = data.usage;
      const cost = (i*3 + o*15 + cr*0.3 + cw*3.75) / 1_000_000;
      console.log(`[AILARA] ${model} | in:${i} out:${o} cr:${cr} | $${cost.toFixed(5)}`);
    }
 
    // If Anthropic returned an error, log it clearly
    if (!response.ok) {
      console.error(`[AILARA] Anthropic error ${response.status}:`, JSON.stringify(data));
    }
 
    return res.status(response.status).json(data);
 
  } catch (err) {
    console.error('[AILARA proxy error]', err.message);
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
}
