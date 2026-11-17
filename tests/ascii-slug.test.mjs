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

test("toAsciiSlug maps NFKD-derived path separators and wildcards to hyphens", () => {
  // U+2100 (℀) decomposes to "a/c" and U+2047 (⁇) to "??". Without sanitising
  // those, a slug becomes a relative path or an invalid Windows filename.
  assert.equal(toAsciiSlug("a\u2100b"), "aa-cb");
  assert.equal(toAsciiSlug("a\u2047b"), "a-b");
});

test("toAsciiSlug never emits Windows-reserved characters from compatibility decompositions", () => {
  const reserved = /[<>:"/\\|?*\x00-\x1F]/;
  // Every code point whose NFKD decomposition introduced a reserved character
  // in the original regression report.
  const codePoints = [
    0x2047, 0x2048, 0x2049, 0x2100, 0x2101, 0x2105, 0x2106,
    0x226e, 0x226f, 0x2a74, 0xfe13, 0xfe16, 0xfe55, 0xfe56,
    0xfe61, 0xfe64, 0xfe65, 0xfe68,
  ];
  for (const cp of codePoints) {
    const slug = toAsciiSlug(`a${String.fromCodePoint(cp)}b`);
    assert.equal(
      reserved.test(slug),
      false,
      `U+${cp.toString(16).toUpperCase()} produced a reserved character: ${slug}`
    );
  }
});
