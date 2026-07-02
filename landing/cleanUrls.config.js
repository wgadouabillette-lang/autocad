/** Marketing pages served as *.html with clean URL rewrites. */
export const CLEAN_URL_SLUGS = [
  "auth",
  "tarifs",
  "careers",
  "ressources",
  "terms",
  "privacy",
  "subprocessors",
];

export const CLEAN_URL_SLUG_SET = new Set(CLEAN_URL_SLUGS);

export function htmlFileForSlug(slug) {
  return `/${slug}.html`;
}
