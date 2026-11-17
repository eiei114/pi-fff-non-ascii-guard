export function toAsciiSlug(name: string): string {
  const slug = name
    .replace(/[\uff01-\uff5e]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    // NFKD can decompose compatibility characters into ASCII characters that
    // are illegal in Windows filenames (e.g. U+2100 -> "a/c", U+2047 -> "??").
    // Sanitise them to "-" before the generic non-ASCII pass so a slug can
    // never turn into a relative path or an invalid filename.
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug.length > 0 ? slug : "non-ascii-file";
}
