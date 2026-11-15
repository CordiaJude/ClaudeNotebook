import { PlainEditor } from "@/components/editor/PlainEditor";

export default function EditorDemo() {
  return (
    <main className="ui-section" style={{ padding: "32px 16px 96px" }}>
      <p className="ui-eyebrow">Editor sandbox (no sync, no save)</p>
      <PlainEditor />
    </main>
  );
}
