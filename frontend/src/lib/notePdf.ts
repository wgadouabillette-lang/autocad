import { hasFormaDesktop } from "./formaDesktop";
import { sanitizeNoteHtml } from "./sanitizeHtml";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printableNoteHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #171717; font: 11pt/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1 { margin: 0 0 18pt; font-size: 23pt; line-height: 1.2; }
    h2 { margin: 18pt 0 5pt; font-size: 16pt; line-height: 1.25; }
    h3 { margin: 12pt 0 4pt; font-size: 13pt; line-height: 1.3; }
    p { margin: 0 0 7pt; }
    ul, ol { margin: 5pt 0 9pt; padding-left: 20pt; }
    li { margin: 2pt 0; }
    mark { padding: 0 2pt; background: #fde68a; }
    table { width: 100%; margin: 10pt 0; border-collapse: collapse; font-size: 10pt; }
    th, td { padding: 5pt 6pt; border: 1px solid #d4d4d4; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${sanitizeNoteHtml(bodyHtml)}
</body>
</html>`;
}

export async function downloadNotePdf(title: string, bodyHtml: string): Promise<void> {
  const safeTitle = title.trim() || "Meetra Notes";
  const safeBody = sanitizeNoteHtml(bodyHtml);
  if (!safeBody.replace(/<[^>]+>/g, "").trim()) return;

  if (hasFormaDesktop() && window.formaDesktop?.saveNotePdf) {
    await window.formaDesktop.saveNotePdf({ title: safeTitle, bodyHtml: safeBody });
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) throw new Error("La fenêtre d'impression a été bloquée.");
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(printableNoteHtml(safeTitle, safeBody));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 150);
}
