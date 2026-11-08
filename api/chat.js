// ── AILARA API Proxy — Vercel Serverless Function ─────────────────────────
// Anonymous consumer app: no user accounts, so this is abuse hardening, not
// user authentication. The browser sends only a task name + small validated
// variables; the model, system prompts, token limits and tool definitions all
// live on the server (see server/tasks.js), so a caller cannot supply their
// own system prompt or pick a model. Layers: Origin check, task validation,
// per-IP rate limit (here + a Vercel Firewall rule), Anthropic spend limit.
import { buildRequest } from '../server/tasks.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const PROD_ORIGINS = [
  'https://ailara.app',
  'https://www.ailara.app',
  'https://ailara-web.vercel.app',
];
const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

const MAX_BODY_CHARS = 3_500_000; // Vercel's own limit is 4.5 MB
const RATE_PER_MIN   = 30;
const RATE_PER_HOUR  = 300;

function allowedOrigins() {
  const list = new Set(PROD_ORIGINS);
  if (process.env.VERCEL_ENV !== 'production') DEV_ORIGINS.forEach(o => list.add(o));
  // This deployment's own URLs (previews, and the production deployment URL)
  [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
    .filter(Boolean).forEach(h => list.add(`https://${h}`));
  return list;
}

// Best-effort in-memory limiter (per warm instance; not shared across instances).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3_600_000);
  const lastMin = recent.filter(t => now - t < 60_000).length;
  if (lastMin >= RATE_PER_MIN || recent.length >= RATE_PER_HOUR) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some(t => now - t < 3_600_000)) hits.delete(k);
  }
  return false;
}

function clientIp(req) {
  const h = req.headers;
  return (h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = allowedOrigins().has(origin);

  res.setHeader('Vary', 'Origin');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') return res.status(allowed ? 204 : 403).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  // Enforced server-side (CORS alone only restrains browsers). Browsers always
  // send Origin on POST; a missing or foreign Origin is not our web app.
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });

  if (rateLimited(clientIp(req))) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Service not configured' });

  let size = 0;
  try { size = JSON.stringify(req.body || {}).length; } catch { size = Infinity; }
  if (size > MAX_BODY_CHARS) return res.status(413).json({ error: 'Request too large' });

  const built = buildRequest(req.body);
  if (built.error) return res.status(400).json({ error: built.error });

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(built.payload),
    });

    const data = await response.json();

    if (data.usage) {
      const { input_tokens: i=0, output_tokens: o=0,
              cache_read_input_tokens: cr=0,
              cache_creation_input_tokens: cw=0 } = data.usage;
      const cost = (i*3 + o*15 + cr*0.3 + cw*3.75) / 1_000_000;
      console.log(`[AILARA] ${req.body.task} ${built.payload.model} | in:${i} out:${o} cr:${cr} | ~$${cost.toFixed(5)}`);
    }

    if (!response.ok) {
      console.error(`[AILARA] Anthropic ${response.status}:`, JSON.stringify(data).slice(0,200));
    }

    return res.status(response.status).json(data);

  } catch (err) {
    console.error('[AILARA proxy error]', err.message);
    return res.status(500).json({ error: 'Proxy error' });
  }
}
