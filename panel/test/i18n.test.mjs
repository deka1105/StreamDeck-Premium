import { test } from "node:test";
import assert from "node:assert/strict";
import { t, resolveLocale, missingKeys, isRtl, LOCALES } from "../src/i18n.js";

test("locale: device language, explicit choice, fallback to English", () => {
  assert.equal(resolveLocale("auto", "de-AT"), "de");
  assert.equal(resolveLocale("fr", "de"), "fr");
  assert.equal(resolveLocale("auto", "ja-JP"), "en");
  assert.equal(isRtl("ar"), true);
  assert.equal(isRtl("es"), false);
});

test("translation: placeholders, English fallback, every locale complete", () => {
  assert.equal(t("switch.to", { page: "Music", n: 3 }, "en"), "Switching to Music in 3…");
  assert.equal(t("switch.to", { page: "Música", n: 2 }, "es"), "Cambiando a Música en 2…");
  assert.equal(t("no.such.key", {}, "de"), "no.such.key");
  for (const [l, miss] of Object.entries(missingKeys())) assert.deepEqual(miss, [], `${LOCALES[l]} is missing keys`);
});
