"use client";
import { useEditorState, type Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/overlays";
import { CELL_COLORS } from "@/lib/editor/constants";

export function TableBar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      inTable: e.isActive("table"),
      bg: (e.getAttributes("tableCell").background ?? e.getAttributes("tableHeader").background ?? null) as string | null,
      canMerge: e.can().mergeCells(),
      canSplit: e.can().splitCell(),
    }),
  });
  if (!s.inTable || !editor.isEditable) return null;
  const c = () => editor.chain().focus();
  const setBg = (v: string | null) => c().setCellAttribute("background", v).run();
  return (
    <div className="cn-toolbar" role="toolbar" aria-label="Table" style={{ flexWrap: "wrap" }}>
      <Button variant="ghost" size="sm" onClick={() => c().addRowAfter().run()}>+ Row</Button>
      <Button variant="ghost" size="sm" onClick={() => c().addColumnAfter().run()}>+ Column</Button>
      <Button variant="ghost" size="sm" onClick={() => c().deleteRow().run()}>− Row</Button>
      <Button variant="ghost" size="sm" onClick={() => c().deleteColumn().run()}>− Column</Button>
      <Button variant="ghost" size="sm" onClick={() => c().toggleHeaderRow().run()}>Header row</Button>
      <Button variant="ghost" size="sm" disabled={!s.canMerge} onClick={() => c().mergeCells().run()}>Merge</Button>
      <Button variant="ghost" size="sm" disabled={!s.canSplit} onClick={() => c().splitCell().run()}>Split</Button>
      <Popover trigger={<Button variant="ghost" size="sm">Cell color</Button>}>
        <div className="cn-swatches" role="group" aria-label="Cell color">
          {CELL_COLORS.map((col) => (
            <button key={col} className="cn-swatch" aria-label={col} aria-pressed={s.bg === col} style={{ background: `var(--cn-cell-${col})` }} onClick={() => setBg(s.bg === col ? null : col)} />
          ))}
        </div>
      </Popover>
      <Button variant="ghost" size="sm" onClick={() => c().deleteTable().run()}>Delete table</Button>
    </div>
  );
}
