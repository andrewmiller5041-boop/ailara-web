import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/chat.js';

process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.VERCEL_ENV = 'production';

let upstreamCalls = 0;
globalThis.fetch = async () => {
  upstreamCalls++;
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
};

let ipCounter = 0;
async function call({ method = 'POST', origin = 'https://ailara.app', body, ip } = {}) {
  const headers = { 'x-real-ip': ip || `10.0.0.${++ipCounter}` };
  if (origin !== null) headers.origin = origin;
  const res = { code: 0, headers: {}, payload: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(p) { this.payload = p; return this; },
    end() { return this; } };
  await handler({ method, headers, body }, res);
  return res;
}

const good = () => ({ model: 'claude-sonnet-5', max_tokens: 1000, messages: [{ role: 'user', content: 'hello' }] });

test('valid browser request is forwarded', async () => {
  const before = upstreamCalls;
  const r = await call({ body: good() });
  assert.equal(r.code, 200);
  assert.equal(upstreamCalls, before + 1);
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://ailara.app');
});

test('curl with no Origin is rejected and never reaches Anthropic', async () => {
  const before = upstreamCalls;
  const r = await call({ origin: null, body: good() });
  assert.equal(r.code, 403);
  assert.equal(upstreamCalls, before);
});

test('foreign Origin is rejected', async () => {
  const before = upstreamCalls;
  const r = await call({ origin: 'https://evil.example', body: good() });
  assert.equal(r.code, 403);
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(upstreamCalls, before);
});

test('localhost origin is not allowed in production', async () => {
  const r = await call({ origin: 'http://localhost:5173', body: good() });
  assert.equal(r.code, 403);
});

test('non-POST methods rejected', async () => {
  assert.equal((await call({ method: 'GET' })).code, 405);
});

test('opus and unknown models are rejected', async () => {
  for (const model of ['claude-opus-4-8', 'claude-opus-4-20250514', 'gpt-4']) {
    const r = await call({ body: { ...good(), model } });
    assert.equal(r.code, 400, model);
  }
});

test('max_tokens above cap or non-integer is rejected', async () => {
  for (const max_tokens of [8000, 4001, 0, -5, '1000', 1.5]) {
    const r = await call({ body: { ...good(), max_tokens } });
    assert.equal(r.code, 400, String(max_tokens));
  }
  assert.equal((await call({ body: { ...good(), max_tokens: 3000 } })).code, 200);
});

test('malformed messages rejected', async () => {
  assert.equal((await call({ body: { ...good(), messages: [] } })).code, 400);
  assert.equal((await call({ body: { ...good(), messages: [{ role: 'system', content: 'x' }] } })).code, 400);
  assert.equal((await call({ body: { ...good(), messages: [{ role: 'user', content: 5 }] } })).code, 400);
  const many = Array.from({ length: 201 }, () => ({ role: 'user', content: 'x' }));
  assert.equal((await call({ body: { ...good(), messages: many } })).code, 400);
});

test('oversized system prompt and unknown tools rejected', async () => {
  assert.equal((await call({ body: { ...good(), system: 'x'.repeat(300_001) } })).code, 400);
  assert.equal((await call({ body: { ...good(), tools: [{ name: 'run_shell' }] } })).code, 400);
  assert.equal((await call({ body: { ...good(), tools: [{ name: 'log_workout' }] } })).code, 200);
});

test('real-sized coach system prompt (~220k chars) is accepted', async () => {
  assert.equal((await call({ body: { ...good(), system: 'x'.repeat(225_000) } })).code, 200);
});

test('per-IP rate limit returns 429 after 30 requests in a minute', async () => {
  const ip = '192.0.2.99';
  let last;
  for (let i = 0; i < 31; i++) last = await call({ ip, body: good() });
  assert.equal(last.code, 429);
  assert.equal(last.headers['Retry-After'], '60');
  // a different IP is unaffected
  assert.equal((await call({ ip: '192.0.2.100', body: good() })).code, 200);
});

test('missing API key yields generic 500, no detail leak', async () => {
  const k = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const r = await call({ body: good() });
  process.env.ANTHROPIC_API_KEY = k;
  assert.equal(r.code, 500);
  assert.ok(!/ANTHROPIC/.test(JSON.stringify(r.payload)));
});
