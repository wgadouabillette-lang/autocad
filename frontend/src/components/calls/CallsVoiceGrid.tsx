import clsx from "clsx";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  distributeMemberBlocksForGrid,
  memberBlocksForVoiceGrid,
  type CallBlock as CallBlockType,
  type JoinRequest,
  type OpenVoiceChannel,
} from "../../lib/calls";
import { callsGridColumnCount, type CallsGridColumnCount } from "../../lib/callsLayout";
import type { TheaterState } from "../../lib/theater";
import AddVoiceChannelButton from "./AddVoiceChannelButton";
import CallBlock from "./CallBlock";
import OpenVoiceChannelBlock from "./OpenVoiceChannelBlock";
import TheaterBlock from "./TheaterBlock";

interface CallsVoiceGridProps {
  measureRef: RefObject<HTMLElement | null>;
  blocks: CallBlockType[];
  openChannels: OpenVoiceChannel[];
  requests: JoinRequest[];
  theater: TheaterState;
  onRequestJoin: (blockId: string) => void;
  onOpenTheater: () => void;
  onStartOpenChannelDraft: () => void;
}

/** Padding horizontal de `.calls-view` (px-5 × 2). */
const CALLS_VIEW_HORIZONTAL_PADDING_PX = 40;

function measureAvailableWidth(measureEl: HTMLElement | null): number {
  const main = document.querySelector<HTMLElement>(".app-layout__main");
  const candidates = [measureEl, main].filter(Boolean) as HTMLElement[];
  const width = Math.max(0, ...candidates.map((el) => el.getBoundingClientRect().width));
  return Math.max(0, width - CALLS_VIEW_HORIZONTAL_PADDING_PX);
}

function MemberColumn({
  blocks,
  allBlocks,
  requests,
  onRequestJoin,
  colIndex,
}: {
  blocks: CallBlockType[];
  allBlocks: CallBlockType[];
  requests: JoinRequest[];
  onRequestJoin: (blockId: string) => void;
  colIndex: number;
}) {
  if (blocks.length === 0) return null;

  return (
    <div className="calls-view__side-col calls-view__member-grid">
      {blocks.map((block, i) => (
        <CallBlock
          key={block.id}
          index={colIndex * 10 + i}
          block={block}
          blocks={allBlocks}
          requests={requests}
          onRequestJoin={onRequestJoin}
          layout="side"
        />
      ))}
    </div>
  );
}

function CenterColumn({
  memberBlocks,
  allBlocks,
  requests,
  theater,
  openChannels,
  onRequestJoin,
  onOpenTheater,
  onStartOpenChannelDraft,
}: {
  memberBlocks: CallBlockType[];
  allBlocks: CallBlockType[];
  requests: JoinRequest[];
  theater: TheaterState;
  openChannels: OpenVoiceChannel[];
  onRequestJoin: (blockId: string) => void;
  onOpenTheater: () => void;
  onStartOpenChannelDraft: () => void;
}) {
  const hasDraftChannel = openChannels.some((channel) => channel.isDraft);

  return (
    <div className="calls-view__center calls-view__grid-slot--center">
      <TheaterBlock index={0} theater={theater} onOpen={onOpenTheater} layout="center" />
      {openChannels.map((channel, index) => (
        <OpenVoiceChannelBlock key={channel.id} index={index + 1} channel={channel} />
      ))}
      <AddVoiceChannelButton
        onStartDraft={onStartOpenChannelDraft}
        disabled={hasDraftChannel}
      />
      {memberBlocks.length > 0 && (
        <div className="calls-view__member-grid">
          {memberBlocks.map((block, i) => (
            <CallBlock
              key={block.id}
              index={i + openChannels.length + 1}
              block={block}
              blocks={allBlocks}
              requests={requests}
              onRequestJoin={onRequestJoin}
              layout="side"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CallsVoiceGrid({
  measureRef,
  blocks,
  openChannels,
  requests,
  theater,
  onRequestJoin,
  onOpenTheater,
  onStartOpenChannelDraft,
}: CallsVoiceGridProps) {
  const gridBlocks = memberBlocksForVoiceGrid(blocks, openChannels);

  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState<CallsGridColumnCount>(5);

  useLayoutEffect(() => {
    const syncLayout = () => {
      const width = measureAvailableWidth(measureRef.current);
      if (width <= 0) return;

      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setColumnCount(callsGridColumnCount(width, rem));
    };

    syncLayout();
    const raf = requestAnimationFrame(() => syncLayout());
    const ro = new ResizeObserver(syncLayout);
    const main = document.querySelector<HTMLElement>(".app-layout__main");
    if (measureRef.current) ro.observe(measureRef.current);
    if (main) ro.observe(main);
    window.addEventListener("resize", syncLayout);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", syncLayout);
    };
  }, [measureRef]);

  const slots = distributeMemberBlocksForGrid(gridBlocks, columnCount);
  const showRightSides = columnCount === 3 || columnCount === 4 || columnCount === 5;

  return (
    <div
      ref={gridRef}
      className={clsx(
        "calls-view__grid calls-view__grid--cascade",
        `calls-view__grid--cols-${columnCount}`,
      )}
    >
      {columnCount > 1 && (
        <div className="calls-view__grid-sides calls-view__grid-sides--left">
          {columnCount >= 2 && (
            <MemberColumn
              blocks={slots.left[0]}
              allBlocks={blocks}
              requests={requests}
              onRequestJoin={onRequestJoin}
              colIndex={0}
            />
          )}
          {columnCount === 5 && (
            <MemberColumn
              blocks={slots.left[1]}
              allBlocks={blocks}
              requests={requests}
              onRequestJoin={onRequestJoin}
              colIndex={1}
            />
          )}
        </div>
      )}

      <CenterColumn
        memberBlocks={slots.center}
        allBlocks={blocks}
        requests={requests}
        theater={theater}
        openChannels={openChannels}
        onRequestJoin={onRequestJoin}
        onOpenTheater={onOpenTheater}
        onStartOpenChannelDraft={onStartOpenChannelDraft}
      />

      {columnCount > 1 && showRightSides && (
        <div className="calls-view__grid-sides calls-view__grid-sides--right">
          {(columnCount === 3 || columnCount === 4 || columnCount === 5) && (
            <MemberColumn
              blocks={slots.right[0]}
              allBlocks={blocks}
              requests={requests}
              onRequestJoin={onRequestJoin}
              colIndex={2}
            />
          )}
          {(columnCount === 4 || columnCount === 5) && (
            <MemberColumn
              blocks={slots.right[1]}
              allBlocks={blocks}
              requests={requests}
              onRequestJoin={onRequestJoin}
              colIndex={3}
            />
          )}
        </div>
      )}
    </div>
  );
}
