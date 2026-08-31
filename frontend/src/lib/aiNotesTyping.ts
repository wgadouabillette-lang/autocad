const BLOCK_IN_MS = 110;
const CHAR_IN_MS = 14;
const MIN_BLOCK_MS = 180;
const MAX_BLOCK_MS = 520;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function blockDelay(textLength: number): number {
  return Math.min(MAX_BLOCK_MS, MIN_BLOCK_MS + textLength * CHAR_IN_MS);
}

function parseBlocks(html: string): Element[] {
  const template = document.createElement("div");
  template.innerHTML = html.trim();
  return Array.from(template.children);
}

function blockSignature(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.classList.remove("ai-notes-type-block", "ai-notes-type-block--in");
  if (!clone.getAttribute("class")) clone.removeAttribute("class");
  return `${clone.tagName}:${clone.innerHTML.replace(/\s+/g, " ").trim()}`;
}

function matchingPrefixCount(existing: Element[], incoming: Element[]): number {
  const limit = Math.min(existing.length, incoming.length);
  let count = 0;
  while (count < limit && blockSignature(existing[count]) === blockSignature(incoming[count])) {
    count += 1;
  }
  return count;
}

function scrollEditorToFollow(editor: HTMLElement): void {
  const scroller =
    editor.closest(".manual-notes-panel__editor-scroll") ??
    editor.closest(".ai-notes-panel__body");
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  editor.scrollTop = editor.scrollHeight;
}

/** Reveal structured HTML into a contentEditable with a smooth block-by-block animation. */
export function animateStructuredHtmlInto(
  editor: HTMLElement,
  html: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const targetBlocks = parseBlocks(html);
    if (targetBlocks.length === 0) {
      if (html.trim()) editor.innerHTML = html;
      resolve();
      return;
    }

    const existing = Array.from(editor.children);
    const keep = matchingPrefixCount(existing, targetBlocks);
    while (editor.children.length > keep) {
      editor.lastElementChild?.remove();
    }

    const toAdd = targetBlocks.slice(keep);
    if (toAdd.length === 0) {
      scrollEditorToFollow(editor);
      resolve();
      return;
    }

    let index = 0;
    let timeoutId = 0;

    const finish = () => {
      window.clearTimeout(timeoutId);
      scrollEditorToFollow(editor);
      resolve();
    };

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      editor.innerHTML = html;
      scrollEditorToFollow(editor);
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const appendNext = () => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      if (index >= toAdd.length) {
        signal?.removeEventListener("abort", onAbort);
        finish();
        return;
      }

      const node = toAdd[index];
      const el = node.cloneNode(true) as HTMLElement;
      el.classList.add("ai-notes-type-block");
      editor.appendChild(el);
      void el.offsetWidth;
      el.classList.add("ai-notes-type-block--in");
      scrollEditorToFollow(editor);

      index += 1;
      const len = el.textContent?.length ?? 0;
      timeoutId = window.setTimeout(appendNext, BLOCK_IN_MS + blockDelay(len) * easeOutCubic(0.65));
    };

    appendNext();
  });
}
