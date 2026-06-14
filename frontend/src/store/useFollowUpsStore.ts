import { create } from "zustand";
import { syncEventsToGoogleCalendar } from "../lib/calendarSync";
import {
  generateFollowUpDraft,
  type CallFollowUpInput,
  type FollowUpActionDraft,
  type FollowUpEmailDraft,
  type FollowUpDraft,
} from "../lib/followUps";
import type { CalendarEvent } from "./useCalendarStore";
import { useCalendarStore } from "./useCalendarStore";
import { useNotificationsStore } from "./useNotificationsStore";
import { useStore } from "./useStore";

interface FollowUpsState {
  generating: boolean;
  draft: FollowUpDraft | null;
  error: string | null;
  lastSyncNote: string | null;
  openReviewFromCapture: (ctx: CallFollowUpInput) => void;
  openReviewError: (message: string) => void;
  updateAction: (id: string, patch: Partial<FollowUpActionDraft>) => void;
  toggleAction: (id: string) => void;
  updateEmail: (id: string, patch: Partial<FollowUpEmailDraft>) => void;
  toggleEmail: (id: string) => void;
  confirmReview: () => Promise<void>;
  dismissReview: () => void;
}

export const useFollowUpsStore = create<FollowUpsState>((set, get) => ({
  generating: false,
  draft: null,
  error: null,
  lastSyncNote: null,

  openReviewFromCapture: (ctx) => {
    useStore.getState().openFollowUpPanel();
    set({ generating: true, draft: null, error: null, lastSyncNote: null });

    void generateFollowUpDraft(ctx).then((draft) => {
      set({ draft, generating: false });
    });
  },

  openReviewError: (message) => {
    useStore.getState().openFollowUpPanel();
    set({
      generating: false,
      draft: null,
      error: message,
      lastSyncNote: null,
    });
  },

  updateAction: (id, patch) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          actions: s.draft.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        },
      };
    }),

  toggleAction: (id) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          actions: s.draft.actions.map((a) =>
            a.id === id ? { ...a, selected: !a.selected } : a,
          ),
        },
      };
    }),

  updateEmail: (id, patch) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          emails: s.draft.emails.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        },
      };
    }),

  toggleEmail: (id) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          emails: s.draft.emails.map((e) =>
            e.id === id ? { ...e, selected: !e.selected } : e,
          ),
        },
      };
    }),

  confirmReview: async () => {
    const { draft } = get();
    if (!draft) return;

    const selectedActions = draft.actions.filter((a) => a.selected);
    const selectedEmails = draft.emails.filter((e) => e.selected && e.to.trim());

    const calendarEvents: CalendarEvent[] = selectedActions.map((action) => ({
      id: `cal-fu-${action.id}`,
      dateKey: action.dueDate,
      startMinutes: action.startMinutes,
      endMinutes: action.endMinutes,
      title: action.title,
      detail: action.detail,
      source: "follow-up",
    }));

    useCalendarStore.getState().addEvents(calendarEvents);

    let syncNote = "Ajouté au calendrier in-app.";
    try {
      const result = await syncEventsToGoogleCalendar(
        selectedActions.map((a) => ({
          title: a.title,
          detail: a.detail,
          dateKey: a.dueDate,
          startMinutes: a.startMinutes,
          endMinutes: a.endMinutes,
        })),
      );
      if (result.synced) {
        syncNote = `${result.created} événement(s) ajouté(s) au calendrier et synchronisé(s) avec Google Calendar.`;
      } else if (result.reason === "not_connected") {
        syncNote = "Ajouté au calendrier in-app. Connectez Google Calendar pour synchroniser.";
      } else {
        syncNote = `Ajouté au calendrier in-app. Sync Google : ${result.reason ?? "indisponible"}.`;
      }
    } catch {
      syncNote = "Ajouté au calendrier in-app. Sync Google Calendar indisponible.";
    }

    if (selectedEmails.length > 0) {
      syncNote += ` ${selectedEmails.length} e-mail(s) enregistré(s) pour envoi.`;
    }

    useStore.getState().saveFollowUpNoteSession({
      recap: draft.recap,
      actions: selectedActions,
      emails: selectedEmails,
      roomId: draft.roomId,
    });

    useNotificationsStore.getState().push({
      kind: "new_feature",
      title: "Follow-ups validés",
      body: syncNote,
    });

    set({
      draft: null,
      generating: false,
      error: null,
      lastSyncNote: syncNote,
    });
  },

  dismissReview: () => set({ draft: null, generating: false, error: null, lastSyncNote: null }),
}));
