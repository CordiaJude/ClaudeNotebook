import type Anthropic from "@anthropic-ai/sdk";

const TARGET = `Where to act. {kind:"find",text,nth?,within?:{table,row,col}} = quoted words exactly as they stand (nth is 1-based when they repeat). {kind:"blocks",ids:[...]} = whole blocks by id. {kind:"cell",table,row,col} = a table cell (0-based, -1 = last). {kind:"root"} = the tab itself (with side "start" or "end").`;
const CONTENT = `What to write. {as:"text",from:{kind:"inline",content:"..."}} re-words in place and keeps marks, chips and comments. {as:"markdown",from:{kind:"inline",content:"..."},blocks?:{KEY:{...}}} builds blocks from GitHub-flavored markdown; chips are tokens <?cn block KEY?> resolved from "blocks": {"type":"date","value":"2026-11-12"}, {"type":"mention","user":"me"}, {"type":"pending","intent":"..."}, {"type":"dropdown","enum":"<id>","index":0}. {as:"row",cells:[...]} adds a table row; {as:"cells",values:[...]} adds a column (one value per row).`;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "notebook_create",
    description:
      "Create a NEW notebook with one tab and open it for the person immediately. Use it first when asked to write something new and no suitable notebook is open. The markdown is the skeleton: '# Title', a byline line '<?cn block asof?> · <?cn block me?>', then one pending block per section (each '<?cn block sN?>' alone on a line). Returns the notebook id, tab id, and every block's id and hash.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Used only if the markdown has no leading '# Title'." },
        markdown: { type: "string", description: "The skeleton markdown." },
        blocks: { type: "object", description: 'Chip definitions by key, e.g. {"asof":{"type":"date","value":"2026-11-12"},"me":{"type":"mention","user":"me"},"s1":{"type":"pending","intent":"Goals: the three outcomes this quarter commits to"}}', additionalProperties: true },
      },
      required: ["markdown"],
    },
  },
  {
    name: "notebook_read",
    description:
      'Read the open tab. mode "outline" (default): one line per top-level block with id and hash h. "view": one block in full (parentId required) with ids and hashes for list items, table rows and cells. "search": blocks containing text. "changes": blocks changed, added or removed since your last read (people edit while you work).',
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["outline", "view", "search", "changes"] },
        parentId: { type: "string", description: "Block id, for mode view." },
        text: { type: "string", description: "Words to find, for mode search." },
        tabId: { type: "string", description: "Defaults to the open tab." },
      },
    },
  },
  {
    name: "notebook_edit",
    description:
      `Apply edit operations, in order, atomically (all or nothing). Ops: replace, insert, delete, move, set, wrap, unwrap, join. Whole-block or cell replace/delete needs ifHash (the block's newest hash; a pending block needs none). Failures return {ok:false, code, fix, current?} - follow "fix". Codes: guard_mismatch, missing_guard, find_none, char_gone, block_gone, cell_none, last_block, anchors_affected, dropped, bad_request, too_many.\n` +
      `replace: {op,target,content,ifHash?,allowDetach?}  insert: {op,target,side:"before"|"after"|"start"|"end",content,each?}  delete: {op,target,ifHash?,each?}  move: {op,target:{kind:"blocks",ids},to:{kind:"blocks",ids:[one]},side}  set: {op,target,attrs} with attrs {heading:1|2|3|null} {kind:"bullet"|"ordered"|"task"} {checked:bool} (blocks) or {background:"gray|red|orange|yellow|green|blue|purple"|null} (cell)  wrap: {op,target,with:"blockquote"|"bulletList"|"orderedList"|"taskList"}  unwrap/join: {op,target}.\n` +
      `Target: ${TARGET}\nContent: ${CONTENT}`,
    input_schema: {
      type: "object",
      properties: {
        ops: { type: "array", maxItems: 50, items: { type: "object", properties: { op: { type: "string", enum: ["replace", "insert", "delete", "move", "set", "wrap", "unwrap", "join"] } }, required: ["op"], additionalProperties: true } },
        mode: { type: "string", enum: ["direct"], description: "Direct edits. Suggesting mode arrives in a later phase." },
        tabId: { type: "string", description: "Defaults to the open tab." },
      },
      required: ["ops"],
    },
  },
];
