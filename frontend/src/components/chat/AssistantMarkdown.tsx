import { Fragment, useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import UpgradeProButton from "./UpgradeProButton";

interface Props {
  text: string;
  reveal?: boolean;
  onRevealComplete?: () => void;
}

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "h4"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; text: string }
  | { kind: "code"; text: string }
  | { kind: "hr" }
  | { kind: "blockquote"; text: string };

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let listItems: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let inCode = false;
  let codeBuffer: string[] = [];

  const flushParagraph = () => {
    if (buffer.length) {
      blocks.push({ kind: "p", text: buffer.join(" ").trim() });
      buffer = [];
    }
  };

  const flushList = () => {
    if (listKind && listItems.length) {
      blocks.push({ kind: listKind, items: listItems });
    }
    listItems = [];
    listKind = null;
  };

  const pushHeading = (level: 1 | 2 | 3 | 4, text: string) => {
    flushParagraph();
    flushList();
    const kind = level === 1 ? "h1" : level === 2 ? "h2" : level === 3 ? "h3" : "h4";
    blocks.push({ kind, text });
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");

    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push({ kind: "code", text: codeBuffer.join("\n") });
        codeBuffer = [];
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "hr" });
      continue;
    }

    const h = /^(#{1,4})\s+(.+)$/.exec(line);
    if (h) {
      pushHeading(Math.min(h[1].length, 4) as 1 | 2 | 3 | 4, h[2].trim());
      continue;
    }

    const boldHeading = /^\*\*(.+?)\*\*:?\s*$/.exec(line.trim());
    if (boldHeading && boldHeading[1].length <= 96) {
      pushHeading(2, boldHeading[1].trim());
      continue;
    }

    const quote = /^>\s*(.+)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "blockquote", text: quote[1].trim() });
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (listKind !== "ul") flushList();
      listKind = "ul";
      listItems.push(bullet[1].trim());
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (listKind !== "ol") flushList();
      listKind = "ol";
      listItems.push(ordered[1].trim());
      continue;
    }

    flushList();
    buffer.push(line.trim());
  }

  if (inCode) {
    blocks.push({ kind: "code", text: codeBuffer.join("\n") });
  }
  flushParagraph();
  flushList();
  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\[[^\]]+\]\(forma:\/\/[a-z-]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`${keyPrefix}-t-${i}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    const token = match[0];
    if (token.startsWith("[")) {
      const action = /\[([^\]]+)\]\(forma:\/\/([a-z-]+)\)/.exec(token);
      if (action && action[2] === "upgrade-pro") {
        nodes.push(<UpgradeProButton key={`${keyPrefix}-a-${i}`} label={action[1]} />);
      } else if (action) {
        nodes.push(<Fragment key={`${keyPrefix}-a-${i}`}>{action[1]}</Fragment>);
      }
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-c-${i}`} className="assistant-markdown__inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="assistant-markdown__strong">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={`${keyPrefix}-i-${i}`} className="assistant-markdown__em">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
    i++;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-end`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes.length ? nodes : [text];
}

const REVEAL_MS_PER_BLOCK = 55;
const REVEAL_BASE_MS = 320;

const HEADING_CLASS: Record<"h1" | "h2" | "h3" | "h4", string> = {
  h1: "assistant-markdown__h1",
  h2: "assistant-markdown__h2",
  h3: "assistant-markdown__h3",
  h4: "assistant-markdown__h4",
};

export default function AssistantMarkdown({ text, reveal = false, onRevealComplete }: Props) {
  const blocks = parseBlocks(text);
  const onRevealCompleteRef = useRef(onRevealComplete);
  onRevealCompleteRef.current = onRevealComplete;

  useEffect(() => {
    if (!reveal || blocks.length === 0) return;
    const delay = REVEAL_BASE_MS + blocks.length * REVEAL_MS_PER_BLOCK;
    const id = window.setTimeout(() => onRevealCompleteRef.current?.(), delay);
    return () => window.clearTimeout(id);
  }, [reveal, text, blocks.length]);

  if (blocks.length === 0) return null;

  return (
    <div className="assistant-markdown">
      {blocks.map((block, i) => {
        const key = `b-${i}`;
        const revealClass = reveal ? "assistant-block-reveal" : undefined;
        const revealStyle = reveal
          ? { animationDelay: `${i * REVEAL_MS_PER_BLOCK}ms` }
          : undefined;

        switch (block.kind) {
          case "h1":
          case "h2":
          case "h3":
          case "h4": {
            const Tag = block.kind === "h1" ? "h2" : block.kind === "h2" ? "h3" : "h4";
            return (
              <Tag
                key={key}
                className={clsx(HEADING_CLASS[block.kind], revealClass)}
                style={revealStyle}
              >
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "ul":
            return (
              <ul
                key={key}
                className={clsx("assistant-markdown__ul", revealClass)}
                style={revealStyle}
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="assistant-markdown__li">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={key}
                className={clsx("assistant-markdown__ol", revealClass)}
                style={revealStyle}
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="assistant-markdown__li">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre
                key={key}
                className={clsx("assistant-markdown__code", revealClass)}
                style={revealStyle}
              >
                {block.text}
              </pre>
            );
          case "blockquote":
            return (
              <blockquote
                key={key}
                className={clsx("assistant-markdown__quote", revealClass)}
                style={revealStyle}
              >
                {renderInline(block.text, key)}
              </blockquote>
            );
          case "hr":
            return (
              <hr
                key={key}
                className={clsx("assistant-markdown__hr", revealClass)}
                style={revealStyle}
              />
            );
          case "p":
          default:
            return (
              <p
                key={key}
                className={clsx("assistant-markdown__p", revealClass)}
                style={revealStyle}
              >
                {renderInline(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
