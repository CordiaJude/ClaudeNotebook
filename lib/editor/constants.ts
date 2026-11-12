export const CELL_COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "purple"] as const;
export type CellColor = (typeof CELL_COLORS)[number];
export const isCellColor = (v: unknown): v is CellColor => typeof v === "string" && (CELL_COLORS as readonly string[]).includes(v);

export const CODE_LANGUAGES = ["latex", "csv", "markdown", "mermaid", "javascript", "typescript", "python", "json", "bash", "sql", "html", "css"] as const;
export const SPECIAL_LANGS = ["latex", "csv", "markdown", "mermaid"] as const;
export const isSpecialLang = (l: unknown): l is (typeof SPECIAL_LANGS)[number] => typeof l === "string" && (SPECIAL_LANGS as readonly string[]).includes(l);

/** Link targets we allow (spec §11): http(s), mailto, in-app anchors/paths. */
export const isSafeHref = (href: string) => /^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(href.trim());

export const slugify = (s: string) => s.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
