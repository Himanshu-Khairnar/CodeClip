"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const EXT_LANGUAGE: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", html: "xml", xml: "xml", css: "css", json: "json",
  yaml: "yaml", yml: "yaml", md: "markdown", csv: "plaintext", txt: "plaintext", log: "plaintext",
};

export function languageForFilename(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return EXT_LANGUAGE[ext];
}

interface CodeViewProps {
  code: string;
  /** highlight.js language id; auto-detected when omitted. */
  language?: string;
  className?: string;
}

/**
 * Syntax-highlighted code. highlight.js is loaded on demand so it never
 * lands in the initial bundle; plain text renders until it arrives.
 */
export function CodeView({ code, language, className }: CodeViewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | undefined>(language);

  useEffect(() => {
    let cancelled = false;
    // Highlighting huge blobs freezes the tab — show those as plain text.
    if (code.length > 200_000 || language === "plaintext") return;
    import("highlight.js/lib/common").then(({ default: hljs }) => {
      if (cancelled) return;
      const result = language && hljs.getLanguage(language)
        ? hljs.highlight(code, { language, ignoreIllegals: true })
        : hljs.highlightAuto(code);
      setHtml(result.value);
      setDetected(result.language);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className={cn("relative", className)}>
      {detected && detected !== "plaintext" && (
        <span className="pointer-events-none absolute right-2 top-2 rounded border border-border bg-card/80 px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground animate-fade">
          {detected}
        </span>
      )}
      <pre className="hljs overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed sm:text-[13px]">
        {html === null ? <code>{code}</code> : <code dangerouslySetInnerHTML={{ __html: html }} />}
      </pre>
    </div>
  );
}
