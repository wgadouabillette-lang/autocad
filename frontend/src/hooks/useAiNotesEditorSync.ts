import { type RefObject, useEffect, useRef } from "react";
import { animateStructuredHtmlInto, animateTranscriptTextInto } from "../lib/aiNotesTyping";
import { useAiNotesStore } from "../store/useAiNotesStore";

function liveTranscriptText(lines: { text: string }[], interimText: string): string {
  return [
    ...lines.map((line) => line.text.trim()).filter(Boolean),
    interimText.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

export function useAiNotesEditorSync(
  editorRef: RefObject<HTMLDivElement | null>,
  onAnimated: () => void,
) {
  const structuredHtml = useAiNotesStore((s) => s.structuredHtml);
  const structuring = useAiNotesStore((s) => s.structuring);
  const active = useAiNotesStore((s) => s.active);
  const lines = useAiNotesStore((s) => s.lines);
  const interimText = useAiNotesStore((s) => s.interimText);
  const lastRenderedRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const html = structuredHtml.trim();
    if (!html || html === lastRenderedRef.current) return;

    const editor = editorRef.current;
    if (!editor) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void animateStructuredHtmlInto(editor, html, controller.signal).then(() => {
      if (controller.signal.aborted) return;
      lastRenderedRef.current = html;
      onAnimated();
    });

    return () => controller.abort();
  }, [structuredHtml, editorRef, onAnimated]);

  useEffect(() => {
    if (!active || structuredHtml.trim()) return;
    const editor = editorRef.current;
    if (!editor) return;

    const text = liveTranscriptText(lines, interimText);
    if (!text || text === lastRenderedRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void animateTranscriptTextInto(editor, text, controller.signal).then(() => {
      if (controller.signal.aborted) return;
      lastRenderedRef.current = text;
      onAnimated();
    });

    return () => controller.abort();
  }, [active, lines, interimText, structuredHtml, editorRef, onAnimated]);

  useEffect(() => {
    if (!active && !structuring && !structuredHtml) {
      lastRenderedRef.current = "";
    }
  }, [active, structuring, structuredHtml]);

  return { structuring, active };
}
