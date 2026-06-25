import clsx from "clsx";

export default function PlayPromptLine({
  query,
  slash = "/play",
  readOnly = true,
}: {
  query: string;
  slash?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="play-prompt-line">
      <p className="play-prompt-line__text">
        <span className="play-prompt-line__slash">{slash}</span>
        <span className={clsx("play-prompt-chip", readOnly && "play-prompt-chip--readonly")}>
          {query}
        </span>
      </p>
    </div>
  );
}
