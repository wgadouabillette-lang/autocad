import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import clsx from "clsx";
import { ArrowUp, ChevronDown, Plus, User, X, FileImage } from "lucide-react";
import { presenceActivityFromModel } from "../lib/aiModelStroke";
import { useAiComposerStore } from "../store/useAiComposerStore";
import { usePresenceActivityStore } from "../store/usePresenceActivityStore";
import { useStore } from "../store/useStore";
import { useCallsStore } from "../store/useCallsStore";
import { usePeopleStore } from "../store/usePeopleStore";
import { AI_MODELS, MODEL_SELECTOR_CHEVRON_GAP_CLASS, composerModelDisplay, modelOptionDisplay, type AiModel } from "../lib/aiModels";
import AiModelSelectorLabel from "./chat/AiModelSelectorLabel";
import type { PromptActionDef } from "../lib/promptActions";
import {
  filterMentionMenu,
  mentionablePeopleForWorkspace,
  peopleHandlesForHighlight,
  type MentionMenuItem,
} from "../lib/promptPeopleMentions";
import { selectedFacesStillInText, stripFaceReferenceFromText } from "../lib/faceReference";
import ChatAppIntegrations from "./chat/ChatAppIntegrations";
import ChatConnectorsList from "./chat/ChatConnectorsList";
import ChatSkillsList from "./chat/ChatSkillsList";
import ChatShortcutsHint from "./chat/ChatShortcutsHint";
import HighlightedPromptInput from "./chat/HighlightedPromptInput";
import { useConnectors } from "../hooks/useConnectors";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { activeStepLabel } from "../lib/aiRun";
import type { ChatMessage } from "../store/useStore";
import StructuredAssistantMessage, {
  AssistantPendingBubble,
} from "./chat/StructuredAssistantMessage";
import ChatPollComposer from "./chat/ChatPollComposer";
import ChatPollVotePanel from "./chat/ChatPollVotePanel";
import { useActiveVoicePoll } from "../hooks/useActiveVoicePoll";
import { useVoicePollStore } from "../store/useVoicePollStore";
import type { ChatSkillDef } from "../lib/chatSkills";
import {
  CREATE_GROUP_COMPOSER_TEXT,
  CREATE_GROUP_SKILL_TEMPLATE,
  MANAGE_COMPOSER_TEMPLATE,
  MANAGE_SKILL_TEMPLATE,
  RECAP_SKILL_TEMPLATE,
  HANDOFF_SKILL_TEMPLATE,
} from "../lib/chatSkills";
import {
  buildManageSkillPayload,
  isManageDraftReady,
  manageComposerTaskSelection,
  looksLikeManageComposer,
  parseManageComposerText,
  parseManagePromptFromText,
  type ManageSchedulePromptDraft,
} from "../lib/manageSchedulePrompt";
import ManageSchedulePromptLine from "./chat/ManageSchedulePromptLine";
import PlayPromptLine from "./chat/PlayPromptLine";
import SpotifyTrackBubble from "./chat/SpotifyTrackBubble";
import {
  filterSlashSkillMenu,
  slashQueryAt,
} from "../lib/promptSlashSkills";
import { isPlaySkillPrompt, parsePlaySkillQuery } from "../lib/playSkill";
import {
  buildGroupNameFromMembers,
  isCreateGroupComposerReady,
  memberIdsFromComposerText,
} from "../lib/createGroupSkill";
import { hasRecapSkillAccess } from "../lib/subscriptionPlans";
import { isRecapDraftReady } from "../lib/recapSkill";
import RecapComposerLine from "./chat/RecapComposerLine";
import { useRecapStore } from "../store/useRecapStore";
import HandoffComposerBar from "./chat/HandoffComposerBar";
import HandoffPreviewBanner from "./chat/HandoffPreviewBanner";
import { useHandoffStore } from "../store/useHandoffStore";
import {
  buildEligibleGroupChatMembers,
  collectAllWorkspaceMembers,
} from "../lib/peopleChat";
import { useAuthStore } from "../store/useAuthStore";
import { useWorkspacePresenceStore } from "../store/useWorkspacePresenceStore";
import { debugLog } from "../lib/debugLog";

const CHAT_COMPOSER_SURFACE_STYLE: CSSProperties = {
  backgroundColor: "var(--forma-chat-composer-bg)",
  border: "1px solid var(--forma-chat-composer-stroke)",
};

interface PromptAttachment {
  id: string;
  file: File;
  previewUrl: string;
  isImage: boolean;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

interface MentionQuery {
  start: number;
  query: string;
}

function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

/** Espace au-dessus d’un message selon le message précédent (hors system). */
function chatMessageSpacingClass(chat: ChatMessage[], index: number): string {
  if (index <= 0) return "";
  let prevIdx = index - 1;
  while (prevIdx >= 0 && chat[prevIdx].role === "system") prevIdx--;
  if (prevIdx < 0) return "";

  const prev = chat[prevIdx];
  const curr = chat[index];
  if (curr.role === "assistant" && prev.role === "user") return "mt-3"; // 12px
  if (curr.role === "user" && prev.role === "assistant") return "mt-6";
  return "mt-3";
}

function userPromptStickyZIndex(chat: ChatMessage[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i++) {
    if (chat[i].role === "user") n++;
  }
  return Math.min(24, 10 + n);
}

function ChatBubble({
  message,
  reveal,
  onRevealComplete,
}: {
  message: ChatMessage;
  reveal?: boolean;
  onRevealComplete?: () => void;
}) {
  if (message.role === "system") return null;

  if (message.role === "user") {
    const managePrompt =
      message.managePrompt ?? parseManagePromptFromText(message.text) ?? undefined;
    if (
      managePrompt &&
      (message.source === "manage-prompt" || /(?:^|\s)\/manage\b/i.test(message.text))
    ) {
      return (
        <div className="chat-user-bubble chat-user-bubble--manage-prompt">
          <ManageSchedulePromptLine draft={managePrompt} readOnly />
        </div>
      );
    }

    const playQuery =
      message.playQuery ?? parsePlaySkillQuery(message.text) ?? undefined;
    if (
      playQuery &&
      (message.source === "play-prompt" || /(?:^|\s)\/play\b/i.test(message.text))
    ) {
      return (
        <div className="chat-user-bubble chat-user-bubble--play-prompt">
          <PlayPromptLine query={playQuery} readOnly />
        </div>
      );
    }

    return (
      <div className="chat-user-bubble">
        <span className="min-w-0 whitespace-pre-wrap break-words">{message.text}</span>
      </div>
    );
  }

  return (
    <div className="chat-assistant-bubble">
      {message.spotifyTrack ? (
        <SpotifyTrackBubble track={message.spotifyTrack} />
      ) : null}
      <StructuredAssistantMessage
        text={message.text}
        reveal={reveal}
        onRevealComplete={onRevealComplete}
      />
    </div>
  );
}

let chatPanelRenderCount = 0;

export default function ChatPanel() {
  chatPanelRenderCount += 1;
  // #region agent log
  if (chatPanelRenderCount <= 15 || chatPanelRenderCount % 20 === 0) {
    debugLog(
      "ChatPanel.tsx:render",
      "ChatPanel render",
      { chatPanelRenderCount },
      "F",
    );
  }
  // #endregion
  const isMobileLayout = useMobileLayout();
  const {
    submitAssistantPrompt,
    aiModel,
    setAiModel,
    aiRun,
    busy,
    stopAiRequest,
    chat,
    selectedFaces,
    clearSelectedFaces,
    activeRoomId,
    activeChatTabId,
  } = useStore();
  const friends = usePeopleStore((s) => s.friends);
  const createGroupChat = usePeopleStore((s) => s.createGroupChat);
  const setActiveFriendThread = usePeopleStore((s) => s.setActiveFriendThread);
  const colleagueThreads = usePeopleStore((s) =>
    s.colleagueThreadsForWorkspace(activeRoomId),
  );
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const switchChatPanelMode = useStore((s) => s.switchChatPanelMode);
  const roomBlocks = useCallsStore((s) => s.callsByRoom[activeRoomId]?.blocks);
  const ensureRoom = useCallsStore((s) => s.ensureRoom);
  const mentionablePeople = useMemo(
    () =>
      mentionablePeopleForWorkspace(
        activeRoomId,
        friends,
        colleagueThreads,
        (roomBlocks ?? []).flatMap((block) => block.participants),
      ),
    [activeRoomId, friends, colleagueThreads, roomBlocks],
  );
  const eligibleGroupMembers = useMemo(
    () =>
      buildEligibleGroupChatMembers({
        friends,
        workspaceMembers: collectAllWorkspaceMembers(membersByWorkspace),
        localUserId: firebaseUid,
      }),
    [friends, membersByWorkspace, firebaseUid],
  );

  useEffect(() => {
    ensureRoom(activeRoomId);
  }, [activeRoomId, ensureRoom]);
  const peopleHandles = useMemo(
    () => peopleHandlesForHighlight(mentionablePeople),
    [mentionablePeople],
  );
  const modelDisplay = composerModelDisplay(aiModel);

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [activeComposerSkill, setActiveComposerSkill] = useState<
    "manage" | "group" | "recap" | null
  >(null);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const openSettingsTab = useStore((s) => s.openSettingsTab);
  const recapDraft = useRecapStore((s) => s.composerDraft);
  const setRecapDraft = useRecapStore((s) => s.setComposerDraft);
  const submitRecap = useRecapStore((s) => s.submitRecap);
  const handoffSelectionMode = useHandoffStore((s) => s.selectionMode);
  const handoffSelectedIndices = useHandoffStore((s) => s.selectedIndices);
  const handoffTarget = useHandoffStore((s) => s.target);
  const handoffSubmitting = useHandoffStore((s) => s.submitting);
  const handoffError = useHandoffStore((s) => s.error);
  const handoffPreview = useHandoffStore((s) => s.preview);
  const enterHandoffSelection = useHandoffStore((s) => s.enterSelectionMode);
  const exitHandoffSelection = useHandoffStore((s) => s.exitSelectionMode);
  const toggleHandoffIndex = useHandoffStore((s) => s.toggleMessageIndex);
  const setHandoffTarget = useHandoffStore((s) => s.setTarget);
  const submitSegmentHandoff = useHandoffStore((s) => s.submitSegmentHandoff);
  const closeHandoffPreview = useHandoffStore((s) => s.closePreview);
  const modelRef = useRef<HTMLDivElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const skillsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recapFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const aiRunStripRef = useRef<HTMLDivElement>(null);
  const [scrollPadBottom, setScrollPadBottom] = useState(16);
  const [revealIdx, setRevealIdx] = useState<number | null>(null);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const pollComposerOpen = useVoicePollStore(
    (s) => s.composerOpenByWorkspace[activeRoomId] ?? false,
  );
  const pollVoteOpenRaw = useVoicePollStore(
    (s) => s.votePanelOpenByWorkspace[activeRoomId] ?? false,
  );
  const activePoll = useActiveVoicePoll(activeRoomId);
  const pollVoteOpen = pollVoteOpenRaw && !!activePoll;
  const pollMorphActive = pollComposerOpen || pollVoteOpen;
  const {
    connectedIds: connectedConnectors,
    statuses: connectorStatuses,
    connect: connectConnector,
    connectingId,
    error: connectorError,
  } = useConnectors();
  const prevChatLenRef = useRef(chat.length);

  const submitCreateGroupFromText = useCallback(
    async (composerText: string) => {
      const ids = memberIdsFromComposerText(composerText, eligibleGroupMembers);
      const members = ids
        .map((id) => eligibleGroupMembers.find((member) => member.id === id))
        .filter((member): member is NonNullable<typeof member> => !!member);
      if (members.length === 0) return;
      const name = buildGroupNameFromMembers(members);
      const memberIds = members.map((member) => member.id);
      setText("");
      setActiveComposerSkill(null);
      const result = await createGroupChat(name, memberIds);
      if (result.ok && result.threadId) {
        switchChatPanelMode("friends");
        setActiveFriendThread(result.threadId);
      }
    },
    [
      createGroupChat,
      eligibleGroupMembers,
      setActiveFriendThread,
      switchChatPanelMode,
    ],
  );

  const setAiComposerEngaged = useAiComposerStore((s) => s.setEngaged);
  const setPresenceActivity = usePresenceActivityStore((s) => s.setActivity);

  const syncAiComposerEngaged = useCallback(
    (focused?: boolean) => {
      const isFocused = focused ?? document.activeElement === textareaRef.current;
      const hasDraft = text.trim().length > 0 || !!activeComposerSkill;
      const chatRunActive =
        busy ||
        aiRun?.status === "running" ||
        aiRun?.status === "done" ||
        aiRun?.status === "error";
      const engaged = isFocused || hasDraft || chatRunActive;
      setAiComposerEngaged(engaged);

      const model =
        chatRunActive && aiRun?.runKind === "chat" ? aiRun.aiModel : aiModel;
      if (engaged) {
        setPresenceActivity(activeRoomId, "local", presenceActivityFromModel(model));
      }
    },
    [
      text,
      activeComposerSkill,
      busy,
      aiRun?.status,
      aiRun?.runKind,
      aiRun?.aiModel,
      aiModel,
      activeRoomId,
      setAiComposerEngaged,
      setPresenceActivity,
    ],
  );

  useEffect(() => {
    syncAiComposerEngaged();
  }, [syncAiComposerEngaged]);

  useEffect(() => {
    return () => {
      setAiComposerEngaged(false);
      const roomId = useStore.getState().activeRoomId;
      setPresenceActivity(roomId, "local", "none");
    };
  }, [setAiComposerEngaged, setPresenceActivity]);

  const syncScrollPadBottom = useCallback(() => {
    const stripH = aiRunStripRef.current?.getBoundingClientRect().height ?? 0;
    const agentActive = busy || aiRun?.status === "running";
    // Le composeur est sous la zone scroll ; seul le bandeau agent empiète (~18px).
    const aiOverlap = agentActive ? Math.max(stripH, 50) - 18 : 0;
    setScrollPadBottom(Math.ceil(aiOverlap + 12));
  }, [aiRun?.status, busy]);

  const scrollChatToLatest = useCallback(() => {
    const scrollEl = messagesScrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTo({
      top: scrollEl.scrollHeight - scrollEl.clientHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const scrollEl = messagesScrollRef.current;
    if (!scrollEl) return;

    const syncStickyState = () => {
      const scrollTop = scrollEl.getBoundingClientRect().top;
      scrollEl.querySelectorAll<HTMLElement>("[data-sticky-prompt]").forEach((el) => {
        const stuck = el.getBoundingClientRect().top <= scrollTop + 11;
        el.classList.toggle("is-stuck", stuck);
      });
    };

    syncStickyState();
    scrollEl.addEventListener("scroll", syncStickyState, { passive: true });
    const ro = new ResizeObserver(syncStickyState);
    ro.observe(scrollEl);
    scrollEl.querySelectorAll("[data-sticky-prompt]").forEach((el) => ro.observe(el));

    return () => {
      scrollEl.removeEventListener("scroll", syncStickyState);
      ro.disconnect();
    };
  }, [chat]);

  const mentionOptions = filterMentionMenu(mentionFilter, mentionablePeople);
  const slashOptions = filterSlashSkillMenu(slashFilter);

  useEffect(() => {
    if (!modelOpen && !mentionOpen && !slashOpen) return;
    const onClick = (e: MouseEvent) => {
      if (modelOpen && modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
      if (mentionOpen && mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setMentionOpen(false);
      }
      if (slashOpen) {
        const inSkills = skillsRef.current?.contains(e.target as Node);
        const inComposer = mentionRef.current?.contains(e.target as Node);
        if (!inSkills && !inComposer) setSlashOpen(false);
      }
    };
    window.document.addEventListener("mousedown", onClick);
    return () => window.document.removeEventListener("mousedown", onClick);
  }, [modelOpen, mentionOpen, slashOpen]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionFilter]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashFilter]);

  useEffect(() => {
    if (!connectorsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConnectorsOpen(false);
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [connectorsOpen]);

  useEffect(() => {
    setConnectorsOpen(false);
  }, [chat.length]);

  useEffect(() => {
    if (selectedFaces.length === 0) {
      setText((prev) => stripFaceReferenceFromText(prev));
    }
  }, [selectedFaces]);

  useEffect(() => {
    if (chat.length > prevChatLenRef.current) {
      const last = chat[chat.length - 1];
      if (last?.role === "assistant") {
        setRevealIdx(chat.length - 1);
      }
    }
    prevChatLenRef.current = chat.length;
  }, [chat]);

  useEffect(() => {
    if (revealIdx !== null && revealIdx >= chat.length) {
      setRevealIdx(null);
    }
  }, [chat.length, revealIdx]);

  const chatIsEmpty = !chat.some((m) => m.role === "user" || m.role === "assistant");
  const displayChat = handoffPreview?.messages ?? chat;
  const agentGenerating = busy && aiRun?.status === "running";
  const lastMessage = chat[chat.length - 1];
  const showPendingAssistant = agentGenerating && lastMessage?.role === "user";

  useEffect(() => {
    syncScrollPadBottom();
    const strip = aiRunStripRef.current;
    if (!strip) return;
    const ro = new ResizeObserver(() => syncScrollPadBottom());
    ro.observe(strip);
    return () => ro.disconnect();
  }, [syncScrollPadBottom, aiRun?.status]);

  useEffect(() => {
    syncScrollPadBottom();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollChatToLatest());
    });
    return () => cancelAnimationFrame(id);
  }, [
    chat,
    busy,
    aiRun?.summary,
    aiRun?.status,
    revealIdx,
    showPendingAssistant,
    scrollPadBottom,
    scrollChatToLatest,
    syncScrollPadBottom,
  ]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: PromptAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      next.push({
        id: `att-${Date.now()}-${i}`,
        file,
        previewUrl: URL.createObjectURL(file),
        isImage: isImageFile(file),
      });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 8));
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const clearAttachments = () => {
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  };

  const insertMentionItem = (item: MentionMenuItem) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const mq = mentionQueryAt(text, caret);
    const start = mq?.start ?? caret;
    const token =
      item.kind === "person"
        ? `@${item.target.mention} `
        : `@${item.action.mention} `;
    const next = text.slice(0, start) + token + text.slice(caret);
    setText(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const pos = start + token.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const insertSkillTemplate = (skill: ChatSkillDef) => {
    if (skill.requiresPaidPlan && !hasRecapSkillAccess(subscriptionPlan, billingManaged, workspaceEnterpriseActive)) {
      openSettingsTab("usage");
      setSlashOpen(false);
      return;
    }
    if (skill.id === "recap") {
      setActiveComposerSkill("recap");
      setRecapDraft(null);
      setText("");
      setSlashOpen(false);
      return;
    }
    if (skill.id === "handoff") {
      enterHandoffSelection();
      setActiveComposerSkill(null);
      setText("");
      setSlashOpen(false);
      return;
    }
    if (skill.id === "group") {
      setActiveComposerSkill("group");
      setText(CREATE_GROUP_COMPOSER_TEXT);
      setSlashOpen(false);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        el?.focus();
        el?.setSelectionRange(1, 1);
        syncMentionMenu(CREATE_GROUP_COMPOSER_TEXT, 1);
      });
      return;
    }
    if (skill.id === "manage") {
      setActiveComposerSkill("manage");
      setText(MANAGE_COMPOSER_TEMPLATE);
      setSlashOpen(false);
      const sel = manageComposerTaskSelection();
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        el?.focus();
        el?.setSelectionRange(sel.start, sel.end);
      });
      return;
    }
    if (skill.id === "play") {
      setActiveComposerSkill(null);
      setText(skill.template);
      setSlashOpen(false);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        const pos = skill.template.length;
        el?.focus();
        el?.setSelectionRange(pos, pos);
      });
      return;
    }

    const el = textareaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const sq = slashQueryAt(text, caret);
    const start = sq?.start ?? caret;
    const next = text.slice(0, start) + skill.template + text.slice(caret);
    setText(next);
    setSlashOpen(false);
    requestAnimationFrame(() => {
      const pos = start + skill.template.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const syncComposerMenu = (value: string, caret: number) => {
    const sq = slashQueryAt(value, caret);
    if (sq) {
      setMentionOpen(false);
      setSlashFilter(sq.query);
      setSlashOpen(filterSlashSkillMenu(sq.query).length > 0);
      return;
    }
    setSlashOpen(false);
    syncMentionMenu(value, caret);
  };

  const syncMentionMenu = (value: string, caret: number) => {
    const mq = mentionQueryAt(value, caret);
    if (!mq) {
      setMentionOpen(false);
      return;
    }
    const options = filterMentionMenu(mq.query, mentionablePeople);
    setMentionFilter(mq.query);
    setMentionOpen(options.length > 0);
  };

  const submit = () => {
    if (activeComposerSkill === "recap") {
      if (!isRecapDraftReady(recapDraft)) return;
      setActiveComposerSkill(null);
      void submitRecap();
      return;
    }
    if (activeComposerSkill === "group") {
      if (!isCreateGroupComposerReady(text, eligibleGroupMembers)) return;
      void submitCreateGroupFromText(text);
      return;
    }
    if (activeComposerSkill === "manage") {
      const parsed = parseManageComposerText(text);
      if (!parsed || !isManageDraftReady(parsed)) return;
      const payload = buildManageSkillPayload(parsed);
      setActiveComposerSkill(null);
      setText("");
      void submitAssistantPrompt(payload.skillText, [], {
        managePrompt: payload.managePrompt,
        userDisplayText: payload.displayText,
      });
      return;
    }

    const raw = text.trim();
    if (!raw && attachments.length === 0) return;

    const prompt = raw || "(Attachments)";
    const imageFiles = attachments.filter((a) => a.isImage).map((a) => a.file);
    setText("");
    clearAttachments();
    void submitAssistantPrompt(prompt, imageFiles).then((result) => {
      if (result?.blocked && result.requireImage) {
        fileInputRef.current?.click();
      }
    });
  };

  const handleStop = () => {
    const prompt = stopAiRequest();
    if (!prompt || prompt === "(Attachments)") return;
    setText(prompt);
  };

  const canSubmit =
    activeComposerSkill === "recap"
      ? isRecapDraftReady(recapDraft)
      : activeComposerSkill === "group"
      ? isCreateGroupComposerReady(text, eligibleGroupMembers)
      : activeComposerSkill === "manage"
      ? (() => {
          const parsed = parseManageComposerText(text);
          return !!parsed && isManageDraftReady(parsed);
        })()
      : text.trim().length > 0 || attachments.length > 0;

  const playQueryDraft = parsePlaySkillQuery(text);
  const canSubmitResolved =
    isPlaySkillPrompt(text.trim()) && !playQueryDraft
      ? false
      : canSubmit;

  const insertConnectorSlash = (slash: string) => {
    setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${slash} ` : `${slash} `));
    setConnectorsOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const placeholder = 'Type "/" for free in-app skills!';

  const composerBlock = handoffPreview ? null : (
    <div className="pointer-events-auto relative">
      <div className="relative">
        <div
          ref={aiRunStripRef}
          className={clsx(
            "absolute left-0 right-0 z-0 overflow-hidden rounded-t-xl rounded-b-none border border-b-0 border-composer-stroke bg-composer-surface shadow-md",
            aiRun?.status === "running" ? "max-h-[50px] opacity-100" : "pointer-events-none max-h-0 opacity-0",
          )}
          style={{ bottom: "calc(100% - 18px)" }}
        >
          {aiRun?.status === "running" && (
            <div className="flex h-[50px] items-start gap-2 px-2.5 pb-1 pt-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-muted-400" />
              <p className="mt-0.5 min-w-0 flex-1 truncate text-[11px] font-medium leading-tight">
                <span className="text-shimmer">{activeStepLabel(aiRun)}</span>
              </p>
              <button
                type="button"
                onClick={handleStop}
                className="mt-0.5 shrink-0 text-[11px] font-medium leading-tight text-muted-400 hover:text-muted-200"
              >
                Stop
              </button>
            </div>
          )}
        </div>

        <div
          className="chat-composer relative z-10 flex flex-col gap-1 rounded-xl px-2 py-1.5"
          style={CHAT_COMPOSER_SURFACE_STYLE}
        >
          {attachments.length > 0 && (
            <div className="flex h-8 items-center gap-1 overflow-hidden">
              {attachments.map((att, i) => (
                <div
                  key={att.id}
                  className={clsx(
                    "group relative h-7 w-7 shrink-0 overflow-hidden",
                    i === 0 && "rounded-tl-md",
                  )}
                  title={att.file.name}
                >
                  {att.isImage ? (
                    <img src={att.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-500">
                      <FileImage size={14} strokeWidth={1.5} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute inset-0 flex items-center justify-center bg-ink-900/55 text-muted-100 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={recapFileInputRef}
            type="file"
            accept="video/*,.webm,.mp4,.mov,.m4v"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setRecapDraft({
                kind: "import",
                file,
                label: file.name.replace(/\.[^.]+$/, "") || "Imported recording",
              });
              e.target.value = "";
            }}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div className={clsx("relative", attachments.length > 0 && "mt-1.5")} ref={mentionRef}>
            {mentionOpen && mentionOptions.length > 0 && (
              <div
                className="absolute bottom-full left-0 z-20 mb-1 w-full min-w-[14rem] rounded-lg border border-ink-700 bg-ink-850 py-1 shadow-xl"
                role="listbox"
                aria-label="Mentions"
              >
                {mentionOptions.map((item, i) => {
                  if (item.kind === "person") {
                    const { target } = item;
                    return (
                      <button
                        key={`person-${target.person.id}`}
                        type="button"
                        role="option"
                        aria-selected={i === mentionIndex}
                        onMouseEnter={() => setMentionIndex(i)}
                        onClick={() => insertMentionItem(item)}
                        className={clsx(
                          "flex w-full gap-2 px-3 py-2 text-left transition-colors",
                          i === mentionIndex ? "bg-ink-750" : "hover:bg-ink-750/80",
                        )}
                      >
                        <User size={14} className="mt-0.5 shrink-0 text-muted-300" />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-muted-100">
                            {target.person.name}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-muted-500">
                            @{target.mention}
                            {target.section === "friends" ? " · Friend" : " · Colleague"}
                          </span>
                        </span>
                      </button>
                    );
                  }

                  const action: PromptActionDef = item.action;
                  const Icon = action.icon;
                  return (
                    <button
                      key={`action-${action.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === mentionIndex}
                      onMouseEnter={() => setMentionIndex(i)}
                      onClick={() => insertMentionItem(item)}
                      className={clsx(
                        "flex w-full gap-2 px-3 py-2 text-left transition-colors",
                        i === mentionIndex ? "bg-ink-750" : "hover:bg-ink-750/80",
                      )}
                    >
                      <Icon size={14} className="mt-0.5 shrink-0 text-muted-300" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-muted-100">
                          @{action.mention}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-muted-500">
                          {action.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {handoffSelectionMode ? (
              <HandoffComposerBar
                selectedCount={handoffSelectedIndices.size}
                target={handoffTarget}
                submitting={handoffSubmitting}
                error={handoffError}
                onTargetChange={setHandoffTarget}
                onCancel={exitHandoffSelection}
                onSubmit={() => void submitSegmentHandoff(chat, activeChatTabId)}
              />
            ) : activeComposerSkill === "recap" ? (
              <RecapComposerLine
                draft={recapDraft}
                onChange={setRecapDraft}
                onImportClick={() => recapFileInputRef.current?.click()}
              />
            ) : (
            <HighlightedPromptInput
              ref={textareaRef}
              value={text}
              placeholder={placeholder}
              peopleHandles={peopleHandles}
              composerSkill={activeComposerSkill}
              onChange={(v) => {
                const trimmed = v.trim().toLowerCase();
                if (trimmed === CREATE_GROUP_SKILL_TEMPLATE) {
                  setActiveComposerSkill("group");
                  setText(CREATE_GROUP_COMPOSER_TEXT);
                  setSlashOpen(false);
                  requestAnimationFrame(() => {
                    const el = textareaRef.current;
                    el?.focus();
                    el?.setSelectionRange(1, 1);
                    syncMentionMenu(CREATE_GROUP_COMPOSER_TEXT, 1);
                  });
                  return;
                }
                if (trimmed === MANAGE_SKILL_TEMPLATE) {
                  setActiveComposerSkill("manage");
                  setText(MANAGE_COMPOSER_TEMPLATE);
                  setSlashOpen(false);
                  const sel = manageComposerTaskSelection();
                  requestAnimationFrame(() => {
                    const el = textareaRef.current;
                    el?.focus();
                    el?.setSelectionRange(sel.start, sel.end);
                  });
                  return;
                }
                if (trimmed === RECAP_SKILL_TEMPLATE) {
                  if (
                    !hasRecapSkillAccess(
                      subscriptionPlan,
                      billingManaged,
                      workspaceEnterpriseActive,
                    )
                  ) {
                    openSettingsTab("usage");
                    setText("");
                    return;
                  }
                  setActiveComposerSkill("recap");
                  setRecapDraft(null);
                  setText("");
                  setSlashOpen(false);
                  return;
                }
                if (trimmed === HANDOFF_SKILL_TEMPLATE) {
                  enterHandoffSelection();
                  setActiveComposerSkill(null);
                  setText("");
                  setSlashOpen(false);
                  return;
                }

                setText(v);
                if (activeComposerSkill === "manage" && !v.trim()) {
                  setActiveComposerSkill(null);
                } else if (
                  activeComposerSkill === "manage" &&
                  !looksLikeManageComposer(v) &&
                  !parseManageComposerText(v)
                ) {
                  setActiveComposerSkill(null);
                }
                if (activeComposerSkill === "group" && !v.includes("@")) {
                  setActiveComposerSkill(null);
                }
                if (selectedFaces.length > 0 && !selectedFacesStillInText(v, selectedFaces)) {
                  clearSelectedFaces();
                }
                const caret = textareaRef.current?.selectionStart ?? v.length;
                syncComposerMenu(v, caret);
                requestAnimationFrame(() => syncAiComposerEngaged());
              }}
              onFocus={() => syncAiComposerEngaged(true)}
              onBlur={() => syncAiComposerEngaged(false)}
              onClick={() => {
                const caret = textareaRef.current?.selectionStart ?? text.length;
                syncComposerMenu(text, caret);
              }}
              onKeyUp={() => {
                const caret = textareaRef.current?.selectionStart ?? text.length;
                syncComposerMenu(text, caret);
              }}
              onKeyDown={(e) => {
                if (slashOpen && slashOptions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashIndex((i) => (i + 1) % slashOptions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashIndex((i) => (i - 1 + slashOptions.length) % slashOptions.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insertSkillTemplate(slashOptions[slashIndex]!);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSlashOpen(false);
                    return;
                  }
                }
                if (mentionOpen && mentionOptions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) => (i + 1) % mentionOptions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insertMentionItem(mentionOptions[mentionIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionOpen(false);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            )}
          </div>
          <div className="flex h-[24px] items-center gap-2">
            <ChatAppIntegrations
              open={connectorsOpen}
              onToggle={() => setConnectorsOpen((v) => !v)}
            />

            <div className="relative" ref={modelRef}>
              <button
                type="button"
                onClick={() => setModelOpen((v) => !v)}
                className={clsx(
                  "inline-flex min-h-[24px] items-center justify-start bg-transparent px-0 py-0 text-[11px] font-medium leading-none hover:text-muted-200",
                  aiModel === "auto" && "-translate-y-[3px]",
                  MODEL_SELECTOR_CHEVRON_GAP_CLASS,
                )}
              >
                <AiModelSelectorLabel
                  {...modelDisplay}
                  nameClassName={aiModel === "auto" ? "text-muted-100" : "text-muted-300"}
                />
                <ChevronDown
                  size={12}
                  className={aiModel === "auto" ? "text-muted-500" : "text-muted-400 opacity-70"}
                />
              </button>
              {modelOpen && (
                <div className="absolute bottom-full left-0 z-10 mb-1 min-w-[11.5rem] rounded-lg border border-ink-700 bg-ink-850 py-1 shadow-xl">
                  {AI_MODELS.map((m) => {
                    const option = modelOptionDisplay(m.id);
                    return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setAiModel(m.id as AiModel);
                        setModelOpen(false);
                      }}
                      className={clsx(
                        "block w-full px-3 py-1.5 text-left text-xs hover:bg-ink-750",
                        aiModel === m.id ? "text-muted-100" : "text-muted-400",
                      )}
                    >
                      <AiModelSelectorLabel
                        {...option}
                        nameClassName={aiModel === m.id ? "text-muted-100" : "text-muted-300"}
                        speedClassName="text-muted-500"
                      />
                    </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (activeComposerSkill === "recap") {
                    recapFileInputRef.current?.click();
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                title={activeComposerSkill === "recap" ? "Import video" : "Add an image or file"}
                className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-transparent text-muted-400 transition-colors hover:text-muted-200 disabled:opacity-30"
              >
                <Plus size={15} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmitResolved}
                title="Send"
                className={clsx(
                  "inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-750 text-muted-200 transition-colors hover:bg-ink-700 disabled:opacity-30",
                )}
              >
                <ArrowUp size={14} strokeWidth={2.5} className="shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="chat-panel-layout relative overflow-hidden">
      {chatIsEmpty && !isMobileLayout && (
        <div className="chat-shortcuts-hint-anchor">
          <ChatShortcutsHint />
        </div>
      )}

      <div
        ref={messagesScrollRef}
        className="chat-messages-scroll relative min-h-0 overflow-y-auto overflow-x-hidden px-3 pb-0"
      >
        {handoffPreview ? (
          <div className="flex flex-col gap-3 pt-3">
            <HandoffPreviewBanner
              title={handoffPreview.title}
              senderName={handoffPreview.senderName}
              onBack={closeHandoffPreview}
            />
            {handoffPreview.kind === "manual-note" && handoffPreview.noteBodyHtml ? (
              <div className="handoff-preview-note">
                {handoffPreview.noteTitle ? (
                  <h2 className="handoff-preview-note__title">{handoffPreview.noteTitle}</h2>
                ) : null}
                <div
                  className="handoff-preview-note__body manual-notes-panel__editor"
                  dangerouslySetInnerHTML={{ __html: handoffPreview.noteBodyHtml }}
                />
              </div>
            ) : (
              displayChat.map((message, i) => {
                if (message.role === "system") return null;
                const spacing = chatMessageSpacingClass(displayChat, i);
                return (
                  <div key={`preview-${message.role}-${i}`} className={spacing}>
                    <ChatBubble message={message} />
                  </div>
                );
              })
            )}
            <div
              ref={messagesEndRef}
              className="shrink-0"
              style={{ height: scrollPadBottom }}
              aria-hidden
            />
          </div>
        ) : !chatIsEmpty ? (
        <div className="flex flex-col pt-3">
          {chat.map((message, i) => {
            if (message.role === "system") return null;
            const spacing = chatMessageSpacingClass(chat, i);
            const selected = handoffSelectedIndices.has(i);
            const bubble = (
              <ChatBubble
                message={message}
                reveal={message.role === "assistant" && i === revealIdx}
                onRevealComplete={() => setRevealIdx(null)}
              />
            );

            const row = (
              <div
                className={clsx(
                  "handoff-select-row",
                  handoffSelectionMode && "handoff-select-row--active",
                  selected && "handoff-select-row--selected",
                )}
              >
                {handoffSelectionMode ? (
                  <button
                    type="button"
                    className={clsx("handoff-select-row__check", selected && "is-checked")}
                    aria-pressed={selected}
                    aria-label={selected ? "Deselect message" : "Select message"}
                    onClick={() => toggleHandoffIndex(i)}
                  />
                ) : null}
                <div className="handoff-select-row__bubble">{bubble}</div>
              </div>
            );

            if (message.role === "user") {
              return (
                <div
                  key={`${message.role}-${i}`}
                  data-sticky-prompt
                  className={clsx(spacing, "chat-sticky-prompt")}
                  style={{ zIndex: userPromptStickyZIndex(chat, i) }}
                >
                  <div className="chat-sticky-prompt__bubble">{row}</div>
                </div>
              );
            }

            return (
              <div key={`${message.role}-${i}`} className={spacing}>
                {row}
              </div>
            );
          })}

          {showPendingAssistant && !handoffSelectionMode && (
            <div className="chat-assistant-bubble mt-3">
              <AssistantPendingBubble />
            </div>
          )}

          <div
            ref={messagesEndRef}
            className="shrink-0"
            style={{ height: scrollPadBottom }}
            aria-hidden
          />
          </div>
        ) : null}
      </div>

      <div
        className={clsx(
          "chat-panel-footer pointer-events-none shrink-0 px-3 pb-3 pt-0",
          pollMorphActive && "chat-panel-footer--poll-morph",
        )}
      >
        <div
          className={clsx(
            "pointer-events-auto relative",
            pollMorphActive && "chat-composer chat-composer-morph rounded-xl",
          )}
          style={pollMorphActive ? CHAT_COMPOSER_SURFACE_STYLE : undefined}
        >
          {pollComposerOpen ? (
            <ChatPollComposer />
          ) : pollVoteOpen ? (
            <ChatPollVotePanel />
          ) : (
            <>
              {slashOpen && slashOptions.length > 0 && (
                <div
                  ref={skillsRef}
                  className="chat-connectors-stage chat-connectors-stage--footer"
                >
                  <ChatSkillsList
                    skills={slashOptions}
                    activeIndex={slashIndex}
                    onActiveIndexChange={setSlashIndex}
                    onSelect={insertSkillTemplate}
                  />
                </div>
              )}
              {connectorsOpen && (
                <div className="chat-connectors-stage chat-connectors-stage--footer">
                  <ChatConnectorsList
                    connectedIds={connectedConnectors}
                    statuses={connectorStatuses}
                    connectingId={connectingId}
                    connectError={connectorError}
                    onConnect={connectConnector}
                    onInsertSlash={insertConnectorSlash}
                  />
                </div>
              )}
              {composerBlock}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
