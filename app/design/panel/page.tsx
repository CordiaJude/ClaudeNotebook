import { AskPanel } from "@/components/editor/AskPanel";
import { NewWithClaude } from "@/app/(app)/notebooks/NewWithClaude";

/** Ask Claude UI sandbox (no backend): tests stub /api/agent/run. */
export default function PanelDemo() {
  return (
    <main className="cn-section" style={{ padding: "32px 16px", display: "grid", gap: 24, maxWidth: 520 }}>
      <NewWithClaude />
      <div style={{ height: 480 }}><AskPanel notebookId="nb-test" tabId="t1" canEdit blank /></div>
    </main>
  );
}
