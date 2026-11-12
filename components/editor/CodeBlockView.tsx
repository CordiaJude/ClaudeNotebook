"use client";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import katex from "katex";
import Papa from "papaparse";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CODE_LANGUAGES, isSpecialLang } from "@/lib/editor/constants";

function Latex({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) katex.render(src, ref.current, { displayMode: true, throwOnError: false, trust: false, output: "htmlAndMathml" });
  }, [src]);
  return <div ref={ref} className="cn-preview" aria-label="Rendered formula" />;
}

function Mermaid({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = "mm" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral" });
        const { svg } = await mermaid.render(id, src);
        if (dead || !ref.current) return;
        const parsed = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
        ref.current.replaceChildren(document.importNode(parsed, true));
        setErr(null);
      } catch (e) {
        if (!dead) setErr(e instanceof Error ? e.message.split("\n")[0]! : "Invalid diagram");
        document.getElementById("d" + id)?.remove();
      }
    }, 400);
    return () => { dead = true; clearTimeout(t); };
  }, [src, id]);
  return (
    <>
      <div ref={ref} className="cn-preview" role="img" aria-label="Rendered diagram" />
      {err ? <div className="cn-caption" role="status" style={{ color: "var(--cn-danger)" }}>Diagram error: {err}</div> : null}
    </>
  );
}

function Csv({ src }: { src: string }) {
  const rows = useMemo(() => Papa.parse<string[]>(src.trim(), { skipEmptyLines: true }).data.slice(0, 201), [src]);
  if (rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div className="cn-preview" style={{ overflowX: "auto" }}>
      <table className="cn-table" aria-label="CSV data (read-only)">
        <thead><tr>{head!.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const lang = (node.attrs.language as string | null) ?? "";
  const text = node.textContent;
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper className="cn-codeblock" data-lang={lang || undefined}>
      <div className="cn-codeblock-bar" contentEditable={false}>
        <select aria-label="Code language" value={lang} disabled={!editable} onChange={(e) => updateAttributes({ language: e.target.value || null })}>
          <option value="">plain text</option>
          {CODE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      {isSpecialLang(lang) ? (
        <div contentEditable={false}>
          {lang === "latex" ? <Latex src={text} /> : null}
          {lang === "mermaid" ? <Mermaid src={text} /> : null}
          {lang === "csv" ? <Csv src={text} /> : null}
          {lang === "markdown" ? <div className="cn-preview cn-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div> : null}
        </div>
      ) : null}
      <pre><NodeViewContent<"code"> as="code" /></pre>
    </NodeViewWrapper>
  );
}
