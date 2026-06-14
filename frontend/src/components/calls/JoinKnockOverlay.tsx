import { createPortal } from "react-dom";
import { useStore } from "../../store/useStore";
import { useCallsStore } from "../../store/useCallsStore";
import {
  findLocalBlock,
  type CallBlock,
  type JoinRequest,
} from "../../lib/calls";

function blockPrimaryName(blocks: CallBlock[], blockId: string): string {
  return blocks.find((b) => b.id === blockId)?.participants[0]?.name ?? "Quelqu'un";
}

function resolveKnock(
  blocks: CallBlock[],
  requests: JoinRequest[],
  localBlockId: string | undefined,
):
  | { mode: "incoming"; request: JoinRequest; knockerName: string }
  | { mode: "outgoing"; request: JoinRequest; targetName: string }
  | null {
  if (!localBlockId) return null;

  const incoming = requests.find(
    (r) => r.status === "pending" && r.toBlockId === localBlockId,
  );
  if (incoming) {
    return {
      mode: "incoming",
      request: incoming,
      knockerName: blockPrimaryName(blocks, incoming.fromBlockId),
    };
  }

  const outgoing = requests.find(
    (r) => r.status === "pending" && r.fromBlockId === localBlockId,
  );
  if (outgoing) {
    return {
      mode: "outgoing",
      request: outgoing,
      targetName: blockPrimaryName(blocks, outgoing.toBlockId),
    };
  }

  return null;
}

export default function JoinKnockOverlay() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const roomCalls = useCallsStore((s) => s.callsByRoom[activeRoomId]);
  const acceptJoin = useCallsStore((s) => s.acceptJoin);
  const declineJoin = useCallsStore((s) => s.declineJoin);
  const cancelJoin = useCallsStore((s) => s.cancelJoin);

  if (!roomCalls) return null;

  const localBlock = findLocalBlock(roomCalls.blocks);
  const knock = resolveKnock(roomCalls.blocks, roomCalls.requests, localBlock?.id);
  if (!knock) return null;

  return createPortal(
    <>
      <div className="join-knock__backdrop" aria-hidden />
      <div
        className="join-knock"
        role="dialog"
        aria-live="polite"
        aria-label={
          knock.mode === "incoming"
            ? `${knock.knockerName} demande à rejoindre`
            : `Demande envoyée à ${knock.targetName}`
        }
      >
        <div className="join-knock__icon" aria-hidden>
          <span className="join-knock__door" />
          <span className="join-knock__knocker" />
        </div>

        <p className="join-knock__title">
          {knock.mode === "incoming" ? (
            <>
              <span className="join-knock__name">{knock.knockerName}</span> is knocking at your
              door...
            </>
          ) : (
            <>
              Knocking at <span className="join-knock__name">{knock.targetName}</span>&apos;s door...
            </>
          )}
        </p>

        {knock.mode === "incoming" && (
          <p className="join-knock__hint">
            Accepter pour rejoindre le salon vocal ensemble.
          </p>
        )}

        {knock.mode === "incoming" ? (
          <div className="join-knock__actions join-knock__actions--split">
            <button
              type="button"
              className="join-knock__btn"
              onClick={() => declineJoin(activeRoomId, knock.request.id)}
            >
              Deny
            </button>
            <button
              type="button"
              className="join-knock__btn"
              onClick={() => acceptJoin(activeRoomId, knock.request.id)}
            >
              Accept
            </button>
          </div>
        ) : (
          <div className="join-knock__actions">
            <button
              type="button"
              className="join-knock__btn w-full"
              onClick={() => cancelJoin(activeRoomId, knock.request.id)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
