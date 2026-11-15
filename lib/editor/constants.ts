export const CELL_COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "purple"] as const;
export type CellColor = (typeof CELL_COLORS)[number];
export const isCellColor = (v: unknown): v is CellColor => typeof v === "string" && (CELL_COLORS as readonly string[]).includes(v);

/** Link targets we allow: http(s), mailto, in-app anchors and paths. Never javascript: or data:. */
export const isSafeHref = (href: string) => /^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(href.trim());

/** Node types that carry a stable `id` attribute. The AI addresses top-level blocks by these ids. */
export const BLOCK_ID_TYPES = ["title", "draftSlot", "heading", "paragraph", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock", "horizontalRule", "table"];
