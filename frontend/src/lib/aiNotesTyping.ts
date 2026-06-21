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

    const template = document.createElement("div");
    template.innerHTML = html.trim();
    const blocks = Array.from(template.childNodes).filter(
      (node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent?.trim() ?? "").length > 0,
    );

    if (blocks.length === 0) {
      editor.innerHTML = html;
      resolve();
      return;
    }

    editor.innerHTML = "";
    let index = 0;
    let timeoutId = 0;

    const finish = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      editor.innerHTML = html;
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const appendNext = () => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      if (index >= blocks.length) {
        signal?.removeEventListener("abort", onAbort);
        finish();
        return;
      }

      const node = blocks[index];
      const el =
        node.nodeType === Node.ELEMENT_NODE
          ? (node.cloneNode(true) as HTMLElement)
          : (() => {
              const p = document.createElement("p");
              p.textContent = node.textContent ?? "";
              return p;
            })();

      el.classList.add("ai-notes-type-block");
      editor.appendChild(el);

      requestAnimationFrame(() => {
        el.classList.add("ai-notes-type-block--in");
      });

      index += 1;
      const len = el.textContent?.length ?? 0;
      timeoutId = window.setTimeout(appendNext, BLOCK_IN_MS + blockDelay(len) * easeOutCubic(0.65));
    };

    appendNext();
  });
}
