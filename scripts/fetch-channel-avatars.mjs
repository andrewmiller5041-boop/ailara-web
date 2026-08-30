/**
 * One-time resolver for instructor channel avatars.
 *
 *   YOUTUBE_API_KEY=xxxxxxxx node scripts/fetch-channel-avatars.mjs
 *
 * Reads src/App.jsx, pulls every `creator` + its channel `url` out of
 * WORKOUT_LIBRARY, resolves each to a real YouTube channel via the Data API v3
 * channels.list endpoint (part=snippet), and prints a ready-to-paste
 *
 *   const CREATOR_AVATARS = { ... }
 *
 * block. Copy that over the placeholder object literal in src/App.jsx.
 *
 * Resolution strategy per creator, cheapest first:
 *   /@handle              -> channels.list?forHandle=handle      (1 unit)
 *   /user/x, bare /x      -> channels.list?forUsername=x         (1 unit)
 *   /c/x  (no match)      -> search.list?q=name&type=channel     (100 units)
 *   playlist / bare host  -> skipped (no channel exists)
 *
 * Total quota: well under 10k/day even with a few search fallbacks.
 * Node 18+ (global fetch). No dependencies.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) {
  console.error("Missing YOUTUBE_API_KEY env var.");
  console.error("Get one at https://console.cloud.google.com/apis/credentials (enable 'YouTube Data API v3').");
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src", "App.jsx");

const API = "https://www.googleapis.com/youtube/v3";

// ── 1. Extract { name, url } pairs from the source ──────────────────────────
const source = await readFile(SRC, "utf8");

// Each creator object opens with  creator:"NAME"  and carries a channel
// url:"https://www.youtube.com/..."  within the next few hundred chars.
const pairs = [];
const re = /creator:\s*"([^"]+)"[\s\S]{0,600}?url:\s*"(https?:\/\/[^"]*youtube\.com[^"]*)"/g;
let m;
while ((m = re.exec(source)) !== null) {
  const name = m[1].trim();
  const url = m[2].trim();
  if (!pairs.some((p) => p.name === name)) pairs.push({ name, url });
}

console.error(`Found ${pairs.length} creators in ${SRC}\n`);

// ── 2. Classify each URL into a lookup ─────────────────────────────────────
function classify(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    if (path.startsWith("/@")) return { kind: "handle", value: path.slice(2).split("/")[0] };
    if (path.startsWith("/channel/")) return { kind: "id", value: path.split("/")[2] };
    if (path.startsWith("/user/")) return { kind: "username", value: path.split("/")[2] };
    if (path.startsWith("/c/")) return { kind: "custom", value: path.split("/")[2] };
    if (path.startsWith("/playlist") || path === "" || path === "/") return { kind: "none" };
    // bare custom URL e.g. youtube.com/jessicasmithtv
    return { kind: "username", value: path.slice(1).split("/")[0] };
  } catch {
    return { kind: "none" };
  }
}

async function api(endpoint, params) {
  const qs = new URLSearchParams({ ...params, key: KEY });
  const res = await fetch(`${API}/${endpoint}?${qs}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${endpoint} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function pick(item) {
  const t = item?.snippet?.thumbnails || {};
  const avatar = (t.medium || t.default || t.high || {}).url || null;
  return item?.id && avatar ? { channelId: item.id, avatar } : null;
}

async function resolve({ name, url }) {
  const c = classify(url);
  try {
    if (c.kind === "id") {
      const d = await api("channels", { part: "snippet", id: c.value });
      const hit = pick(d.items?.[0]);
      if (hit) return { name, ...hit, via: "id" };
    }
    if (c.kind === "handle") {
      const d = await api("channels", { part: "snippet", forHandle: c.value });
      const hit = pick(d.items?.[0]);
      if (hit) return { name, ...hit, via: "handle" };
    }
    if (c.kind === "username" || c.kind === "custom") {
      const d = await api("channels", { part: "snippet", forUsername: c.value });
      const hit = pick(d.items?.[0]);
      if (hit) return { name, ...hit, via: "username" };
    }
    if (c.kind !== "none") {
      // last resort: text search on the creator name
      const d = await api("search", { part: "snippet", type: "channel", q: name, maxResults: "1" });
      const item = d.items?.[0];
      if (item?.id?.channelId) {
        const full = await api("channels", { part: "snippet", id: item.id.channelId });
        const hit = pick(full.items?.[0]);
        if (hit) return { name, ...hit, via: "search" };
      }
    }
  } catch (err) {
    console.error(`  ! ${name}: ${err.message}`);
    return { name, error: err.message };
  }
  return { name, unresolved: true, url };
}

// ── 3. Resolve sequentially (quota-friendly, easy to read logs) ────────────
const resolved = [];
const skipped = [];
for (const p of pairs) {
  const c = classify(p.url);
  if (c.kind === "none") {
    skipped.push(p.name);
    console.error(`  - ${p.name}: no channel (${p.url})`);
    continue;
  }
  const r = await resolve(p);
  if (r.avatar) {
    resolved.push(r);
    console.error(`  ✓ ${r.name}  [${r.via}]  ${r.channelId}`);
  } else {
    skipped.push(p.name);
    console.error(`  ? ${p.name}: unresolved`);
  }
}

// ── 4. Emit the paste-ready block ─────────────────────────────────────────
resolved.sort((a, b) => a.name.localeCompare(b.name));
const lines = resolved.map(
  (r) => `  ${JSON.stringify(r.name)}: { channelId: ${JSON.stringify(r.channelId)}, avatar: ${JSON.stringify(r.avatar)} },`
);

console.log("\n// ---- paste over CREATOR_AVATARS in src/App.jsx ----\n");
console.log("const CREATOR_AVATARS = {");
console.log(lines.join("\n"));
console.log("};");
console.error(`\nResolved ${resolved.length}/${pairs.length}. Unresolved (monogram fallback): ${skipped.length ? skipped.join(", ") : "none"}`);
