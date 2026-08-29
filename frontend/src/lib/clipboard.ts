import { hasFormaDesktop } from "./formaDesktop";

function fallbackCopyText(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "-9999px";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(field);
  }
}

/** Copy text on web + Electron. Windows packaged Chromium often rejects `navigator.clipboard`. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text.trim() ? text : "";
  if (!value) return false;

  if (hasFormaDesktop() && window.formaDesktop?.writeClipboardText) {
    try {
      const result = await window.formaDesktop.writeClipboardText(value);
      if (result?.ok) return true;
    } catch {
      // Fall through to browser APIs.
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Electron without clipboard permission, or insecure context.
  }

  return fallbackCopyText(value);
}
