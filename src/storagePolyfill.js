// window.storage polyfill
//
// The component was originally built and tested inside Claude.ai's artifact
// preview, which provides a built-in `window.storage` async key-value API.
// That API does not exist on a normally-deployed website — so without this
// file, every persistence feature (meal plans, supplement stacks, daily
// tracking, etc.) would silently fail to save or load.
//
// This shim implements the same interface, backed by the browser's real
// localStorage, so nothing in the component needs to change. Data is
// per-browser/per-device (there's no backend here to make it a true
// multi-device "shared" store) — the `shared` parameter is accepted for
// interface compatibility but does not change where data is stored.

const PREFIX = "ailara-storage:";

function readAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const rawKey = localStorage.key(i);
    if (rawKey && rawKey.startsWith(PREFIX)) {
      out[rawKey.slice(PREFIX.length)] = localStorage.getItem(rawKey);
    }
  }
  return out;
}

window.storage = {
  async get(key) {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return { key, value: raw, shared: false };
  },

  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return { key, value, shared: false };
    } catch (e) {
      console.error("storage.set failed:", e);
      return null;
    }
  },

  async delete(key) {
    const existed = localStorage.getItem(PREFIX + key) !== null;
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: existed, shared: false };
  },

  async list(prefix = "") {
    const all = readAll();
    const keys = Object.keys(all).filter(k => k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};
