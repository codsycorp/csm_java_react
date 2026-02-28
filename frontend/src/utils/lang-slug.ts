// Helper: detect language prefix and extract slug from path
// Supported: /, /vi/, /en/, /ja/, /zh/, /ko/ ...

const SUPPORTED_LANGS = ["vi", "en", "ja", "zh", "ko"];

export function extractLangAndSlug(path: string): { lang: string, slug: string } {
  let lang = "vi";
  let working = path.trim();
  if (working.startsWith("/")) working = working.slice(1);
  const segs = working.split("/");
  if (segs.length > 0 && SUPPORTED_LANGS.includes(segs[0].toLowerCase())) {
    lang = segs[0].toLowerCase();
    segs.shift();
  }
  // Remove .shtml or .html
  let slug = segs.join("/").replace(/\.(s?html?)$/, "");
  return { lang, slug };
}

// Example:
// extractLangAndSlug("/en/cho-thue-xe.shtml") => { lang: "en", slug: "cho-thue-xe" }
// extractLangAndSlug("/phan-mem.shtml") => { lang: "vi", slug: "phan-mem" }
