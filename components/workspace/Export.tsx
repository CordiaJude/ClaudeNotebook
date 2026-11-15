"use client";
/* S10: take the doc elsewhere. The file is built on the server from the live document and handed to the browser. */
import { useState } from "react";
import { ExportList, type ExportState } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";
import { IconDownload } from "@/components/ui/icons";
import { Popover } from "@/components/ui/overlays";

export function ExportButton({ artifactId }: { artifactId: string }) {
  const [state, setState] = useState<ExportState | undefined>();
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (format: string) => {
    setState({ format, status: "working" }); setProblem(null);
    try {
      const res = await fetch("/api/exports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artifactId, format }) });
      if (!res.ok) { const j = (await res.json().catch(() => null)) as { message?: string } | null; setProblem(j?.message ?? null); setState({ format, status: "error" }); return; }
      const name = decodeURIComponent(res.headers.get("X-Filename") ?? `export.${format}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ format, status: "done" });
    } catch { setState({ format, status: "error" }); }
  };
  return (
    <Popover trigger={<Button variant="secondary" size="sm" onClick={() => { if (state?.status !== "working") { setState(undefined); setProblem(null); } }}><IconDownload /> <span className="ui-ws-wide">Export</span></Button>}>
      <div style={{ margin: -6 }}>
        <ExportList kind="doc" state={state} onExport={(f) => void run(f)} bare />
        {problem ? <p className="ui-error" role="alert" style={{ padding: "4px 10px 8px" }}>{problem}</p> : null}
      </div>
    </Popover>
  );
}
