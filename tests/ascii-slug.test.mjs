import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const { toAsciiSlug } = await import(
  pathToFileURL(path.join(root, "..", "lib", "ascii-slug.ts")).href
);

// Precomposed (NFC) and decomposed (NFD) spellings of the same names: macOS
// stores NFD in the filesystem while most editors save NFC.
const CAFE_NFC = "Caf\u00e9 r\u00e9sum\u00e9";
const CAFE_NFD = "Cafe\u0301 re\u0301sume\u0301";

test("toAsciiSlug returns fallback for empty result", () => {
  assert.equal(toAsciiSlug("あいう"), "non-ascii-file");
});

test("toAsciiSlug transliterates accented Latin letters instead of dropping them", () => {
  assert.equal(toAsciiSlug(CAFE_NFC), "cafe-resume");
  assert.equal(toAsciiSlug("na\u00efve_Stra\u00dfe"), "naive_stra-e");
  assert.equal(toAsciiSlug("\u00c5ngstr\u00f6m"), "angstrom");
});

test("toAsciiSlug gives the same slug for NFC and NFD input", () => {
  assert.notEqual(CAFE_NFC, CAFE_NFD);
  assert.equal(toAsciiSlug(CAFE_NFC), toAsciiSlug(CAFE_NFD));
});

test("toAsciiSlug keeps Japanese characters out of the slug but keeps ASCII parts", () => {
  assert.equal(toAsciiSlug("日本語 Caf\u00e9"), "cafe");
  assert.equal(
    toAsciiSlug("SpreadsheetToJson_wrapあり・nullなし"),
    "spreadsheettojson_wrap-null"
  );
});

test("toAsciiSlug keeps the existing full-width ASCII conversion", () => {
  assert.equal(toAsciiSlug("１２３ ＡＢＣ"), "123-abc");
});

test("toAsciiSlug still falls back when only non-Latin characters remain", () => {
  assert.equal(toAsciiSlug("めも"), "non-ascii-file");
});
