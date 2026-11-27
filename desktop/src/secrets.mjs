// Secrets for integrations (PLAN D10): app passwords, tokens, API keys.
// They never go into panel.json and never reach the phone.
//
// Under Electron they are encrypted with safeStorage (Keychain on macOS, DPAPI
// on Windows); the host CLI (dev/CI) falls back to a 0600 file. Either way
// the file is <dataDir>/secrets.json and only holds ciphertext or, in the
// fallback, plaintext readable only by this user.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NAME_RE = /^[a-z0-9:_-]{1,80}$/i;

export function createSecrets({ dir, crypto = null } = {}) {
  // `crypto` is Electron's safeStorage when available: { isEncryptionAvailable, encryptString, decryptString }.
  const usable = !!(crypto && crypto.isEncryptionAvailable?.());
  const file = dir ? join(dir, "secrets.json") : null;
  let data = {};
  if (file && existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, "utf8")) ?? {};
    } catch {
      data = {};
    }
  }
  const persist = () => {
    if (!file) return;
    writeFileSync(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  return {
    protected: usable,
    set(name, value) {
      if (!NAME_RE.test(name)) throw new Error("bad secret name");
      if (value === null || value === undefined || value === "") {
        delete data[name];
      } else {
        const v = String(value).slice(0, 4096);
        data[name] = usable ? { enc: crypto.encryptString(v).toString("base64") } : { plain: v };
      }
      persist();
    },
    get(name) {
      const e = data[name];
      if (!e) return null;
      if (e.enc && usable) return crypto.decryptString(Buffer.from(e.enc, "base64"));
      return e.plain ?? null;
    },
    has: (name) => !!data[name],
  };
}
