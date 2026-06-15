import clsx from "clsx";
import { Check, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocalAiStroke, useRemoteAiStroke } from "../../hooks/useAiBlockStroke";
import { isDraftOpenChannel, type OpenVoiceChannel } from "../../lib/calls";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import CallBlockCard from "./CallBlockCard";
import DeleteVoiceChannelOverlay from "./DeleteVoiceChannelOverlay";

interface OpenVoiceChannelBlockProps {
  index?: number;
  channel: OpenVoiceChannel;
}

export default function OpenVoiceChannelBlock({ index = 0, channel }: OpenVoiceChannelBlockProps) {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const inCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const localChannelId = useCallsStore((s) => s.localOpenChannelByRoom[activeRoomId]);
  const joinOpenChannel = useCallsStore((s) => s.joinOpenChannel);
  const prefetchVoiceMedia = useCallsStore((s) => s.prefetchVoiceMedia);
  const confirmOpenChannel = useCallsStore((s) => s.confirmOpenChannel);
  const removeOpenChannel = useCallsStore((s) => s.removeOpenChannel);

  const [draftName, setDraftName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const draftInputRef = useRef<HTMLInputElement>(null);

  const isDraft = isDraftOpenChannel(channel);
  const isHere = inCall && localChannelId === channel.id;
  const remoteParticipant = channel.participants.find((p) => !p.isLocal);
  const hasRemoteParticipants = !!remoteParticipant;
  const canJoin = !isHere && !isDraft;
  const statusLabel = isHere ? "En appel" : hasRemoteParticipants ? "Rejoindre" : "Vide";

  useEffect(() => {
    if (!canJoin) return;
    void prefetchVoiceMedia();
  }, [canJoin, prefetchVoiceMedia, channel.id]);
  const localAiStroke = useLocalAiStroke();
  const remoteAiStroke = useRemoteAiStroke(
    activeRoomId,
    remoteParticipant?.id ?? "local",
  );
  const aiStroke = isHere ? localAiStroke : remoteAiStroke;
  const canConfirmDraft = draftName.trim().length > 0;

  useEffect(() => {
    if (!isDraft) return;
    const timer = window.setTimeout(() => draftInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isDraft]);

  const resetDelete = () => {
    setConfirmingDelete(false);
    setConfirmText("");
  };

  const handleDeleteConfirm = () => {
    removeOpenChannel(activeRoomId, channel.id);
    resetDelete();
  };

  const handleDraftSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canConfirmDraft) return;
    confirmOpenChannel(activeRoomId, channel.id, draftName);
  };

  const submitDraft = () => {
    if (!canConfirmDraft) return;
    confirmOpenChannel(activeRoomId, channel.id, draftName);
  };

  const cancelDraft = () => {
    removeOpenChannel(activeRoomId, channel.id);
  };

  if (isDraft) {
    return (
      <CallBlockCard
        className={clsx(
          "call-block",
          "call-block--cascade",
          "call-block--center-slot",
          "call-block--draft",
        )}
        style={{ animationDelay: `${index * 20}ms` }}
        title=""
        titleContent={
          <form className="open-channel-draft-form" onSubmit={handleDraftSubmit}>
            <input
              ref={draftInputRef}
              type="text"
              className="open-channel-draft-form__input"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Nom du salon vocal"
              maxLength={48}
              aria-label="Nom du salon vocal"
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelDraft();
              }}
            />
          </form>
        }
        participants={channel.participants}
        participantLayout="tiles"
        showHandRaise={false}
        showActivity={false}
        trailing={
          <div className="open-channel-draft-form__actions">
            <button
              type="button"
              className="open-channel-draft-form__confirm"
              disabled={!canConfirmDraft}
              onClick={submitDraft}
              aria-label="Confirmer le nom"
              title="Confirmer"
            >
              <Check size={12} strokeWidth={2.5} aria-hidden />
            </button>
            <button
              type="button"
              className="open-channel-draft-form__cancel"
              onClick={cancelDraft}
              aria-label="Annuler"
              title="Annuler"
            >
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        }
        mainDisabled
        mainAriaLabel="Nouveau salon vocal"
      />
    );
  }

  return (
    <>
      <CallBlockCard
        className={clsx(
          "call-block",
          "call-block--cascade",
          "call-block--center-slot",
          canJoin && "call-block--clickable",
          isHere && "call-block--local",
          hasRemoteParticipants && "call-block--connected",
        )}
        style={{ animationDelay: `${index * 20}ms` }}
        title={channel.name}
        participants={channel.participants}
        participantLayout="tiles"
        showHandRaise
        showActivity={hasRemoteParticipants}
        activityUserId={remoteParticipant?.id ?? "local"}
        activityIsLocal={false}
        aiStroke={aiStroke}
        trailing={
          <button
            type="button"
            className="call-block__kick"
            onClick={(event) => {
              event.stopPropagation();
              setConfirmingDelete(true);
            }}
            aria-label={`Supprimer ${channel.name}`}
            title="Supprimer le salon"
          >
            <Trash2 size={12} strokeWidth={2.25} aria-hidden />
          </button>
        }
        onMainClick={
          canJoin ? () => joinOpenChannel(activeRoomId, channel.id) : undefined
        }
        mainDisabled={!canJoin}
        mainAriaLabel={`${statusLabel} — ${channel.name}`}
      />

      {confirmingDelete && (
        <DeleteVoiceChannelOverlay
          channelName={channel.name}
          confirmText={confirmText}
          onConfirmTextChange={setConfirmText}
          onConfirm={handleDeleteConfirm}
          onCancel={resetDelete}
        />
      )}
    </>
  );
}
