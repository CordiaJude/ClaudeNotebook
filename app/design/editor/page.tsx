import { PlainEditor } from "@/components/editor/PlainEditor";

export default function EditorDemo() {
  return (
    <main className="cn-section" style={{ padding: "32px 16px 96px" }}>
      <p className="cn-eyebrow">Editor sandbox (no sync, no save)</p>
      <PlainEditor />
    </main>
  );
}
