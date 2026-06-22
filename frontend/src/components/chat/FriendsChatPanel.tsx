import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { ArrowUp, FileImage, Paperclip, Smile, Trash2, UsersRound, X } from "lucide-react";
import type { ChatSkillDef } from "../../lib/chatSkills";
import {
  buildGroupNameFromMembers,
  createDefaultCreateGroupDraft,
  type CreateGroupSkillDraft,
} from "../../lib/createGroupSkill";
import {
  createDefaultManageDraft,
  isManageDraftReady,
  type ManageSchedulePromptDraft,
} from "../../lib/manageSchedulePrompt";
import {
  PEOPLE_GROUP_SKILL_TEMPLATE,
  PEOPLE_HANDOFF_SKILL_TEMPLATE,
  PEOPLE_MANAGE_SKILL_TEMPLATE,
} from "../../lib/peopleChatSkills";
import type { PeopleMessage, Person } from "../../lib/peopleChat";
import {
  buildEligibleGroupChatMembers,
  buildMessagePanelThreads,
  collectAllWorkspaceMembers,
  resolvePersonPhotoURL,
} from "../../lib/peopleChat";
import {
  isPeopleMemberPromptReady,
  participantPeopleFromIds,
  seedMembersForPeopleThread,
} from "../../lib/peopleChatSkillActions";
import { filterPeopleSlashSkillMenu, slashQueryAt } from "../../lib/promptSlashSkills";
import { useAuthStore } from "../../store/useAuthStore";
import { useCallsStore } from "../../store/useCallsStore";
import { useHandoffStore } from "../../store/useHandoffStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useNotificationsStore } from "../../store/useNotificationsStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import UserAvatar from "../UserAvatar";
import ChatSkillsList from "./ChatSkillsList";
import CreateGroupPromptLine from "./CreateGroupPromptLine";
import ManageSchedulePromptLine from "./ManageSchedulePromptLine";
import HandoffComposerBar from "./HandoffComposerBar";
import HighlightedPromptInput from "./HighlightedPromptInput";
import PeopleChatEmojiPicker from "./PeopleChatEmojiPicker";
import PeopleChatThreadMessages from "./PeopleChatThreadMessages";
import DeletePeopleChatOverlay from "./DeletePeopleChatOverlay";
import SkillTimeline, {
  type SkillTimelineStep,
  type SkillTimelineSuccess,
} from "./SkillTimeline";
import {
  GROUP_TIMELINE_STEPS,
  HANDOFF_TIMELINE_STEPS,
  MANAGE_TIMELINE_STEPS,
  SKILL_ACTION_LABELS,
  SKILL_SUCCESS_LABELS,
  type SkillTimelineId,
} from "../../lib/skillTimelines";
import { useCalendarOverlayStore } from "../../store/useCalendarOverlayStore";
import { hasAiAccess } from "../../lib/subscriptionPlans";

const EMPTY_MESSAGES: PeopleMessage[] = [];

const CHAT_COMPOSER_SURFACE_STYLE: CSSProperties = {
  backgroundColor: "var(--forma-chat-composer-bg)",
  border: "1px solid var(--forma-chat-composer-stroke)",
};

interface ComposerAttachment {
  id: string;
  file: File;
  isImage: boolean;
  previewUrl: string;
}

function buildAttachment(file: File): ComposerAttachment {
  const isImage = file.type.startsWith("image/");
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    isImage,
    previewUrl: isImage ? URL.createObjectURL(file) : "",
  };
}


export default function FriendsChatPanel() {
  const friendThreads = usePeopleStore((s) => s.friendThreadsList());
  const groupThreads = usePeopleStore((s) => s.groupThreads);
  const friends = usePeopleStore((s) => s.friends);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const colleagueThreads = usePeopleStore((s) =>
    s.colleagueThreadsForWorkspace(activeRoomId),
  );
  const roomBlocks = useCallsStore((s) => s.callsByRoom[activeRoomId]?.blocks);
  const presenceMembers = useWorkspacePresenceStore(
    (s) => s.membersByWorkspace[activeRoomId],
  );
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);
  const personPhotoByUserId = usePeopleStore((s) => s.personPhotoByUserId);
  const hydratePersonPhotos = usePeopleStore((s) => s.hydratePersonPhotos);
  const ensureColleagueThread = usePeopleStore((s) => s.ensureColleagueThread);
  const ensureFriendThread = usePeopleStore((s) => s.ensureFriendThread);
  const sendMessage = usePeopleStore((s) => s.sendMessage);
  const sendManageScheduleMessage = usePeopleStore((s) => s.sendManageScheduleMessage);
  const markThreadRead = usePeopleStore((s) => s.markThreadRead);
  const markFriendsTabSeen = usePeopleStore((s) => s.markFriendsTabSeen);
  const setActiveFriendThread = usePeopleStore((s) => s.setActiveFriendThread);
  const deletePeopleThread = usePeopleStore((s) => s.deletePeopleThread);
  const createGroupChat = usePeopleStore((s) => s.createGroupChat);
  const dismissedThreadIds = usePeopleStore((s) => s.dismissedThreadIds);
  const handoffSelectionMode = useHandoffStore(
    (s) => s.selectionMode && s.selectionSource === "people",
  );
  const handoffSelectedIndices = useHandoffStore((s) => s.selectedIndices);
  const handoffTarget = useHandoffStore((s) => s.target);
  const handoffSubmitting = useHandoffStore((s) => s.submitting);
  const handoffError = useHandoffStore((s) => s.error);
  const exitHandoffSelection = useHandoffStore((s) => s.exitSelectionMode);
  const toggleHandoffIndex = useHandoffStore((s) => s.toggleMessageIndex);
  const setHandoffTarget = useHandoffStore((s) => s.setTarget);
  const submitPeopleSegmentHandoff = useHandoffStore((s) => s.submitPeopleSegmentHandoff);
  const enterPeopleHandoffSelection = useHandoffStore((s) => s.enterPeopleSelectionMode);
  const selectedThreadId = usePeopleStore((s) => s.activeFriendThreadId);
  const thread = usePeopleStore((s) =>
    selectedThreadId ? s.threadById(selectedThreadId) : undefined,
  );
  const messages = usePeopleStore((s) => {
    if (!selectedThreadId) return EMPTY_MESSAGES;
    const group = s.groupThreads.find((item) => item.id === selectedThreadId);
    if (group) return group.messages;
    for (const item of s.friendThreads) {
      if (item.id === selectedThreadId) return item.messages;
    }
    for (const threads of Object.values(s.colleagueThreadsByWorkspace)) {
      const found = threads.find((item) => item.id === selectedThreadId);
      if (found) return found.messages;
    }
    return EMPTY_MESSAGES;
  });

  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const openSettingsTab = useStore((s) => s.openSettingsTab);
  const manageSkillAvailable = hasAiAccess(
    subscriptionPlan,
    billingManaged,
    workspaceEnterpriseActive,
  );

  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [activeComposerSkill, setActiveComposerSkill] = useState<"group" | "manage" | null>(null);
  const [memberPromptDraft, setMemberPromptDraft] = useState<CreateGroupSkillDraft>(
    createDefaultCreateGroupDraft(),
  );
  const [manageDraft, setManageDraft] = useState<ManageSchedulePromptDraft>(
    createDefaultManageDraft,
  );
  const [manageSubmitting, setManageSubmitting] = useState(false);
  const [activeSkillRun, setActiveSkillRun] = useState<{
    runId: string;
    threadId: string;
    skillId: SkillTimelineId;
    steps: SkillTimelineStep[];
    apiDone: boolean;
    apiError: string | null;
    success: SkillTimelineSuccess | null;
  } | null>(null);
  const handoffRunIdRef = useRef<string | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLUListElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const slashOptions = filterPeopleSlashSkillMenu(slashFilter);
  const skillComposerOpen = activeComposerSkill !== null;
  const showSlashMenu =
    slashOpen && slashOptions.length > 0 && !handoffSelectionMode && !skillComposerOpen;

  const seedMembers = useMemo(
    () => (thread ? seedMembersForPeopleThread(thread, firebaseUid) : []),
    [thread, firebaseUid],
  );
  const requiredMemberIds = useMemo(
    () => seedMembers.map((member) => member.id),
    [seedMembers],
  );
  const eligibleMembers = useMemo(
    () =>
      buildEligibleGroupChatMembers({
        friends,
        workspaceMembers: collectAllWorkspaceMembers(membersByWorkspace),
        localUserId: firebaseUid,
      }),
    [friends, membersByWorkspace, firebaseUid],
  );
  const promptMembers = useMemo(() => {
    const byId = new Map<string, Person>();
    for (const person of [...seedMembers, ...eligibleMembers]) {
      byId.set(person.id, person);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [seedMembers, eligibleMembers]);
  const memberPromptReady = isPeopleMemberPromptReady(
    memberPromptDraft.selectedMemberIds,
    requiredMemberIds,
  );

  useEffect(() => {
    return () => {
      attachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    };
  }, [attachments]);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = Array.from(files).map(buildAttachment);
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((att) => att.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((att) => att.id !== id);
    });
  };

  const workspaceMemberPeople = useMemo(() => {
    const seen = new Set<string>();
    const out: Person[] = [];
    const push = (id: string, name: string) => {
      if (!id || id === "local" || (firebaseUid && id === firebaseUid) || seen.has(id)) return;
      seen.add(id);
      out.push({ id, name: name.trim() || "Member", handle: id });
    };

    if (presenceMembers) {
      for (const [uid, entry] of Object.entries(presenceMembers)) {
        push(uid, entry.displayName);
      }
    }

    for (const block of roomBlocks ?? []) {
      for (const participant of block.participants) {
        if (!participant.isLocal) {
          push(participant.id, participant.name);
        }
      }
    }

    return out;
  }, [presenceMembers, roomBlocks, firebaseUid]);

  const combinedThreads = useMemo(() => {
    const direct = buildMessagePanelThreads({
      workspaceId: activeRoomId,
      friends,
      friendThreads,
      colleagueThreads,
      workspaceMembers: workspaceMemberPeople,
      localUserId: firebaseUid,
    });
    const groups = groupThreads.map((thread) => ({
      id: thread.id,
      personId: thread.personId,
      personName: thread.groupName ?? thread.personName,
      section: "groups" as const,
      preview: thread.preview,
      updatedAt: thread.updatedAt,
      unread: thread.unread,
      messages: thread.messages,
      memberCount: thread.memberIds?.length ?? 0,
    }));
    return [...groups, ...direct]
      .filter((thread) => !dismissedThreadIds.includes(thread.id))
      .sort((a, b) => {
      const aActive = a.messages.length > 0 || a.unread > 0 ? 1 : 0;
      const bActive = b.messages.length > 0 || b.unread > 0 ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      if (aActive && bActive && b.updatedAt !== a.updatedAt) {
        return b.updatedAt - a.updatedAt;
      }
      return a.personName.localeCompare(b.personName, "fr");
    });
  }, [
    activeRoomId,
    friends,
    friendThreads,
    groupThreads,
    colleagueThreads,
    workspaceMemberPeople,
    firebaseUid,
    dismissedThreadIds,
  ]);

  const photoLookup = useMemo(
    () => ({ preferredWorkspaceId: activeRoomId, photoCache: personPhotoByUserId }),
    [activeRoomId, personPhotoByUserId],
  );

  useEffect(() => {
    const personIds = combinedThreads.map((item) => item.personId);
    if (thread) personIds.push(thread.personId);
    void hydratePersonPhotos([...new Set(personIds)]);
  }, [combinedThreads, thread, hydratePersonPhotos]);

  useEffect(() => {
    markFriendsTabSeen();
  }, [markFriendsTabSeen]);

  useEffect(() => {
    return () => {
      setActiveFriendThread(null);
    };
  }, [setActiveFriendThread]);

  useEffect(() => {
    if (selectedThreadId) {
      markThreadRead(selectedThreadId);
      setDraft("");
      setEmojiPickerOpen(false);
      setSlashOpen(false);
      setSlashFilter("");
      setSlashIndex(0);
      setActiveComposerSkill(null);
      setMemberPromptDraft(createDefaultCreateGroupDraft());
      setManageSubmitting(false);
      setActiveSkillRun(null);
      exitHandoffSelection();
      setAttachments((prev) => {
        prev.forEach((att) => {
          if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
        });
        return [];
      });
    }
  }, [selectedThreadId, markThreadRead, exitHandoffSelection]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashFilter]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, selectedThreadId]);

  const openThread = (item: (typeof combinedThreads)[number]) => {
    if (item.section === "groups") {
      setActiveFriendThread(item.id);
      return;
    }
    const threadId =
      item.section === "friends"
        ? ensureFriendThread({
            id: item.personId,
            name: item.personName,
            handle: item.personId,
          })
        : ensureColleagueThread(activeRoomId, item.personId, item.personName);
    setActiveFriendThread(threadId);
  };

  const deleteTarget = useMemo(
    () => combinedThreads.find((item) => item.id === deleteTargetId) ?? null,
    [combinedThreads, deleteTargetId],
  );

  const confirmDeleteThread = async () => {
    if (!deleteTargetId || deleteBusy) return;
    setDeleteError(null);
    setDeleteBusy(true);
    const result = await deletePeopleThread(deleteTargetId);
    setDeleteBusy(false);
    if (!result.ok) {
      setDeleteError(result.error ?? "Impossible de supprimer la conversation.");
      return;
    }
    setDeleteTargetId(null);
  };

  const insertManageComposer = useCallback(() => {
    setActiveComposerSkill("manage");
    setManageDraft(createDefaultManageDraft());
    setDraft("");
    setSlashOpen(false);
  }, []);

  const submit = () => {
    if (handoffSelectionMode) return;
    if (activeComposerSkill === "group") {
      if (!memberPromptReady) return;
      void submitPeopleGroupSkill();
      return;
    }
    if (activeComposerSkill === "manage") {
      if (!isManageDraftReady(manageDraft) || manageSubmitting) return;
      void submitPeopleManageSkill(manageDraft);
      setActiveComposerSkill(null);
      setManageDraft(createDefaultManageDraft());
      return;
    }
    if (skillComposerOpen) return;
    if (!thread) return;

    const trimmed = draft.trim();
    if (!trimmed && attachments.length === 0) return;
    if (trimmed) sendMessage(thread.id, trimmed);
    setActiveSkillRun(null);
    setDraft("");
    setAttachments((prev) => {
      prev.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
      return [];
    });
    textareaRef.current?.focus();
  };

  const handleEmojiSelect = (emoji: string) => {
    setDraft((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  const syncComposerMenu = useCallback((value: string, caret: number) => {
    const sq = slashQueryAt(value, caret);
    if (sq) {
      setSlashFilter(sq.query);
      setSlashOpen(filterPeopleSlashSkillMenu(sq.query).length > 0);
      return;
    }
    setSlashFilter("");
    setSlashOpen(false);
  }, []);

  const dismissComposerSkill = useCallback(() => {
    setActiveComposerSkill(null);
    setMemberPromptDraft(createDefaultCreateGroupDraft());
    setManageDraft(createDefaultManageDraft());
    setManageSubmitting(false);
  }, []);

  const buildSkillRun = useCallback(
    (threadId: string, skillId: SkillTimelineId, steps: SkillTimelineStep[]) => ({
      runId: `${skillId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      threadId,
      skillId,
      steps,
      apiDone: false,
      apiError: null as string | null,
      success: null as SkillTimelineSuccess | null,
    }),
    [],
  );

  const submitPeopleGroupSkill = useCallback(async () => {
    if (!thread) return;
    if (!isPeopleMemberPromptReady(memberPromptDraft.selectedMemberIds, requiredMemberIds)) {
      return;
    }
    const members = participantPeopleFromIds(
      memberPromptDraft.selectedMemberIds,
      eligibleMembers,
      seedMembers,
    );
    if (members.length === 0) return;
    const name = buildGroupNameFromMembers(members);
    const sourceThreadId = thread.id;
    setActiveSkillRun(buildSkillRun(sourceThreadId, "group", GROUP_TIMELINE_STEPS));
    dismissComposerSkill();
    const result = await createGroupChat(
      name,
      members.map((member) => member.id),
    );
    if (result.ok && result.threadId) {
      const newThreadId = result.threadId;
      setActiveSkillRun((prev) =>
        prev && prev.skillId === "group" && prev.threadId === sourceThreadId
          ? {
              ...prev,
              apiDone: true,
              success: {
                label: SKILL_SUCCESS_LABELS.group,
                action: {
                  label: SKILL_ACTION_LABELS.group ?? "View group",
                  onClick: () => {
                    setActiveFriendThread(newThreadId);
                    setActiveSkillRun(null);
                  },
                },
              },
            }
          : prev,
      );
    } else {
      setActiveSkillRun((prev) =>
        prev && prev.skillId === "group" && prev.threadId === sourceThreadId
          ? { ...prev, apiError: result.error ?? "Group creation failed." }
          : prev,
      );
    }
  }, [
    thread,
    memberPromptDraft.selectedMemberIds,
    requiredMemberIds,
    eligibleMembers,
    seedMembers,
    createGroupChat,
    dismissComposerSkill,
    setActiveFriendThread,
    buildSkillRun,
  ]);

  const submitPeopleManageSkill = useCallback(
    async (managePrompt: ManageSchedulePromptDraft) => {
      if (!thread || manageSubmitting) return;
      if (!manageSkillAvailable) {
        openSettingsTab("usage");
        setDraft("");
        return;
      }
      const sourceThreadId = thread.id;
      setManageSubmitting(true);
      setActiveSkillRun(buildSkillRun(sourceThreadId, "manage", MANAGE_TIMELINE_STEPS));
      setDraft("");
      const result = await sendManageScheduleMessage(thread.id, managePrompt);
      setManageSubmitting(false);
      if (!result.ok) {
        setActiveSkillRun((prev) =>
          prev && prev.skillId === "manage" && prev.threadId === sourceThreadId
            ? { ...prev, apiError: result.error ?? "Impossible de planifier les tâches." }
            : prev,
        );
        useNotificationsStore.getState().push({
          kind: "message",
          title: "Planning non envoyé",
          body: result.error ?? "Impossible de planifier les tâches.",
        });
        return;
      }
      setActiveSkillRun((prev) =>
        prev && prev.skillId === "manage" && prev.threadId === sourceThreadId
          ? {
              ...prev,
              apiDone: true,
              success: {
                label: SKILL_SUCCESS_LABELS.manage,
                action: {
                  label: SKILL_ACTION_LABELS.manage ?? "View deadlines",
                  onClick: () => {
                    useCalendarOverlayStore.getState().togglePanel();
                    setActiveSkillRun(null);
                  },
                },
              },
            }
          : prev,
      );
      textareaRef.current?.focus();
    },
    [
      thread,
      manageSubmitting,
      sendManageScheduleMessage,
      buildSkillRun,
      manageSkillAvailable,
      openSettingsTab,
    ],
  );

  const submitPeopleHandoffSkill = useCallback(() => {
    if (!thread) return;
    const sourceThreadId = thread.id;
    const runId = `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    handoffRunIdRef.current = runId;
    setActiveSkillRun({
      runId,
      threadId: sourceThreadId,
      skillId: "handoff",
      steps: HANDOFF_TIMELINE_STEPS,
      apiDone: false,
      apiError: null,
      success: null,
    });
    void submitPeopleSegmentHandoff(messages, sourceThreadId);
  }, [thread, messages, submitPeopleSegmentHandoff]);

  useEffect(() => {
    if (!activeSkillRun || activeSkillRun.skillId !== "handoff") return;
    if (handoffSubmitting) return;
    if (activeSkillRun.apiDone || activeSkillRun.apiError) return;
    if (handoffError) {
      setActiveSkillRun((prev) =>
        prev && prev.skillId === "handoff"
          ? { ...prev, apiError: handoffError }
          : prev,
      );
      return;
    }
    setActiveSkillRun((prev) =>
      prev && prev.skillId === "handoff"
        ? {
            ...prev,
            apiDone: true,
            success: { label: SKILL_SUCCESS_LABELS.handoff },
          }
        : prev,
    );
  }, [handoffSubmitting, handoffError, activeSkillRun]);

  const insertSkillTemplate = useCallback(
    (skill: ChatSkillDef) => {
      if (!thread) return;

      if (skill.requiresPaidPlan && !manageSkillAvailable) {
        openSettingsTab("usage");
        setSlashOpen(false);
        setSlashFilter("");
        return;
      }

      if (skill.id === "manage") {
        insertManageComposer();
        return;
      }

      if (skill.id === "handoff") {
        setSlashOpen(false);
        setSlashFilter("");
        setDraft("");
        enterPeopleHandoffSelection(thread.id);
        return;
      }

      if (skill.id === "group") {
        setSlashOpen(false);
        setSlashFilter("");
        setDraft("");
        setActiveComposerSkill("group");
        setMemberPromptDraft({
          selectedMemberIds: seedMembers.map((member) => member.id),
          query: "",
        });
        return;
      }

      const el = textareaRef.current;
      const value = el?.value ?? draft;
      const caret = el?.selectionStart ?? value.length;
      const sq = slashQueryAt(value, caret);
      const start = sq?.start ?? caret;
      const next = value.slice(0, start) + skill.template + value.slice(caret);
      setDraft(next);
      setSlashOpen(false);
      requestAnimationFrame(() => {
        const pos = start + skill.template.length;
        el?.focus();
        el?.setSelectionRange(pos, pos);
        syncComposerMenu(next, pos);
      });
    },
    [
      thread,
      draft,
      syncComposerMenu,
      insertManageComposer,
      enterPeopleHandoffSelection,
      seedMembers,
      manageSkillAvailable,
      openSettingsTab,
    ],
  );

  if (thread) {
    const partnerPhotoURL = thread.section === "groups"
      ? undefined
      : resolvePersonPhotoURL(thread.personId, membersByWorkspace, photoLookup);
    const canSubmit =
      handoffSelectionMode
        ? false
        : activeComposerSkill === "group"
          ? memberPromptReady
          : activeComposerSkill === "manage"
            ? isManageDraftReady(manageDraft) && !manageSubmitting
            : draft.trim().length > 0 || attachments.length > 0;
    const composerPlaceholder =
      thread.section === "groups"
        ? `Écrire dans ${thread.groupName ?? thread.personName}…`
        : `Write to ${thread.personName}…`;
    return (
      <div className="chat-panel-layout relative h-full min-h-0 min-w-0 w-full max-w-full overflow-hidden">
        <div className="chat-messages-scroll relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-hidden">
          <PeopleChatThreadMessages
            partnerName={thread.groupName ?? thread.personName}
            partnerId={thread.personId}
            partnerPhotoURL={partnerPhotoURL}
            messages={messages}
            listRef={messagesScrollRef}
            className="chat-messages-scroll min-h-0 flex-1"
            showAuthors={thread.section === "groups"}
            handoffSelectionMode={handoffSelectionMode}
            handoffSelectedIndices={handoffSelectedIndices}
            onToggleHandoffIndex={toggleHandoffIndex}
            tailContent={
              activeSkillRun && activeSkillRun.threadId === thread.id ? (
                <SkillTimeline
                  key={activeSkillRun.runId}
                  steps={activeSkillRun.steps}
                  apiDone={activeSkillRun.apiDone}
                  apiError={activeSkillRun.apiError}
                  success={activeSkillRun.success}
                  onStop={() => setActiveSkillRun(null)}
                />
              ) : null
            }
          />
        </div>

        <div
          className={clsx(
            "chat-panel-footer pointer-events-none w-full min-w-0 max-w-full shrink-0 overflow-x-hidden px-3 pb-3 pt-0",
            (emojiPickerOpen || skillComposerOpen) && "chat-panel-footer--poll-morph",
          )}
        >
          <div className="pointer-events-auto relative w-full min-w-0 max-w-full">
            {showSlashMenu ? (
              <div className="chat-connectors-stage chat-connectors-stage--footer">
                <ChatSkillsList
                  skills={slashOptions}
                  activeIndex={slashIndex}
                  onActiveIndexChange={setSlashIndex}
                  onSelect={insertSkillTemplate}
                />
              </div>
            ) : null}
            <form
              className="w-full min-w-0 max-w-full"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
            <div
              className={clsx(
                "relative",
                (emojiPickerOpen || skillComposerOpen) &&
                  "chat-composer chat-composer-morph rounded-xl",
                !emojiPickerOpen &&
                  !skillComposerOpen &&
                  "chat-composer z-10 flex flex-col gap-1 rounded-xl px-2 py-1.5",
              )}
              style={CHAT_COMPOSER_SURFACE_STYLE}
            >
              {emojiPickerOpen ? (
                <PeopleChatEmojiPicker
                  onSelect={handleEmojiSelect}
                  onClose={() => setEmojiPickerOpen(false)}
                />
              ) : handoffSelectionMode ? (
                <HandoffComposerBar
                  selectedCount={handoffSelectedIndices.size}
                  target={handoffTarget}
                  submitting={handoffSubmitting}
                  error={handoffError}
                  onTargetChange={setHandoffTarget}
                  onCancel={exitHandoffSelection}
                  onSubmit={submitPeopleHandoffSkill}
                />
              ) : activeComposerSkill === "group" ? (
                <CreateGroupPromptLine
                  draft={memberPromptDraft}
                  members={promptMembers}
                  lockedMemberIds={requiredMemberIds}
                  chipLabel="Créer un groupe"
                  onChange={setMemberPromptDraft}
                  onDismiss={dismissComposerSkill}
                  onSubmit={() => void submitPeopleGroupSkill()}
                  canSubmit={memberPromptReady}
                />
              ) : activeComposerSkill === "manage" ? (
                <ManageSchedulePromptLine
                  draft={manageDraft}
                  onChange={setManageDraft}
                  onDismiss={dismissComposerSkill}
                />
              ) : (
                <>
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
                        aria-label="Remove attachment"
                      >
                        <X size={12} strokeWidth={2.5} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}

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

              <HighlightedPromptInput
                ref={textareaRef}
                value={draft}
                placeholder={composerPlaceholder}
                composerSkill={null}
                onChange={(value) => {
                  const trimmed = value.trim().toLowerCase();
                  if (trimmed === PEOPLE_MANAGE_SKILL_TEMPLATE) {
                    if (!manageSkillAvailable) {
                      openSettingsTab("usage");
                      setDraft("");
                      setSlashOpen(false);
                      return;
                    }
                    insertManageComposer();
                    return;
                  }
                  if (trimmed === PEOPLE_HANDOFF_SKILL_TEMPLATE && thread) {
                    setSlashOpen(false);
                    setSlashFilter("");
                    setDraft("");
                    enterPeopleHandoffSelection(thread.id);
                    return;
                  }
                  if (trimmed === PEOPLE_GROUP_SKILL_TEMPLATE) {
                    setSlashOpen(false);
                    setSlashFilter("");
                    setDraft("");
                    setActiveComposerSkill("group");
                    setMemberPromptDraft({
                      selectedMemberIds: seedMembers.map((member) => member.id),
                      query: "",
                    });
                    return;
                  }
                  setDraft(value);
                  const caret = textareaRef.current?.selectionStart ?? value.length;
                  syncComposerMenu(value, caret);
                }}
                onClick={() => {
                  const caret = textareaRef.current?.selectionStart ?? draft.length;
                  syncComposerMenu(draft, caret);
                }}
                onKeyUp={() => {
                  const caret = textareaRef.current?.selectionStart ?? draft.length;
                  syncComposerMenu(draft, caret);
                }}
                onKeyDown={(e) => {
                  if (showSlashMenu && slashOptions.length > 0) {
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

                  if (e.key === "Enter" && !e.shiftKey && !handoffSelectionMode && !skillComposerOpen) {
                    e.preventDefault();
                    submit();
                  }
                }}
                className="px-1 py-1 text-muted-100"
              />
              <div className="flex h-[24px] items-center gap-2">
                <button
                  type="button"
                  title="Add attachment"
                  aria-label="Add attachment"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-transparent text-muted-400 transition-colors hover:text-muted-200"
                >
                  <Paperclip size={14} strokeWidth={2.25} aria-hidden />
                </button>

                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEmojiPickerOpen(true)}
                    title="Add emoji"
                    aria-label="Add emoji"
                    className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-transparent text-muted-400 transition-colors hover:text-muted-200"
                  >
                    <Smile size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    title="Send"
                    aria-label="Send"
                    className={clsx(
                      "inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-750 text-muted-200 transition-colors hover:bg-ink-700 disabled:opacity-30",
                    )}
                  >
                    <ArrowUp size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="friends-chat-panel">
      {combinedThreads.length === 0 ? (
        <p className="friends-chat-panel__empty">
          No contacts yet. Add friends by email in settings or join a workspace with other members.
        </p>
      ) : (
        <ul className="friends-chat-panel__list">
          {combinedThreads.map((item) => (
            <li key={item.id} className="messages-overlay__thread-item">
              <div className="messages-overlay__thread-row-wrap">
                <button
                  type="button"
                  className={clsx(
                    "messages-overlay__thread-row messages-thread-card",
                    item.unread > 0 && "messages-thread-card--unread",
                  )}
                  onClick={() => openThread(item)}
                >
                  {item.section === "groups" ? (
                    <span className="messages-overlay__avatar messages-overlay__avatar--group messages-thread-card__avatar">
                      <UsersRound size={16} aria-hidden />
                    </span>
                  ) : (
                    <UserAvatar
                      userId={item.personId}
                      name={item.personName}
                      photoURL={resolvePersonPhotoURL(item.personId, membersByWorkspace, photoLookup)}
                      className="messages-overlay__avatar messages-thread-card__avatar"
                    />
                  )}
                  <span className="messages-thread-card__body">
                    <span className="messages-overlay__thread-name">{item.personName}</span>
                    <span className="messages-overlay__thread-preview">
                      {item.preview ||
                        (item.section === "groups"
                          ? `Groupe · ${"memberCount" in item ? item.memberCount : 0} membres`
                          : item.section === "friends"
                            ? "Friend · New conversation"
                            : "Workspace member")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="messages-overlay__thread-delete"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTargetId(item.id);
                  }}
                  aria-label={
                    item.section === "groups"
                      ? `Supprimer le groupe ${item.personName}`
                      : `Supprimer la conversation avec ${item.personName}`
                  }
                  title={item.section === "groups" ? "Supprimer le groupe" : "Supprimer la conversation"}
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteTarget ? (
        <DeletePeopleChatOverlay
          title={
            deleteTarget.section === "groups"
              ? `Supprimer ${deleteTarget.personName} ?`
              : `Supprimer la conversation avec ${deleteTarget.personName} ?`
          }
          hint={
            deleteTarget.section === "groups"
              ? "Ce groupe et tous ses messages seront supprimés définitivement pour tous les membres."
              : "Cette conversation et tous ses messages seront supprimés définitivement pour les deux participants."
          }
          busy={deleteBusy}
          onConfirm={() => void confirmDeleteThread()}
          onCancel={() => {
            if (deleteBusy) return;
            setDeleteTargetId(null);
            setDeleteError(null);
          }}
        />
      ) : null}
      {deleteError ? (
        <p className="friends-chat-panel__delete-error" role="alert">
          {deleteError}
        </p>
      ) : null}
    </div>
  );
}
