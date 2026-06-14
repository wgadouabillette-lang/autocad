import clsx from "clsx";
import { Check, Loader2, Mail, Mic } from "lucide-react";
import { formatDayLabel, formatScheduleTime } from "../../lib/daySchedule";
import { useFollowUpCaptureStore } from "../../store/useFollowUpCaptureStore";
import { useFollowUpsStore } from "../../store/useFollowUpsStore";

export default function FollowUpPanel() {
  const captureActive = useFollowUpCaptureStore((s) => s.active);
  const captureBusy = useFollowUpCaptureStore((s) => s.busy);
  const generating = useFollowUpsStore((s) => s.generating);
  const draft = useFollowUpsStore((s) => s.draft);
  const error = useFollowUpsStore((s) => s.error);
  const lastSyncNote = useFollowUpsStore((s) => s.lastSyncNote);
  const updateAction = useFollowUpsStore((s) => s.updateAction);
  const toggleAction = useFollowUpsStore((s) => s.toggleAction);
  const updateEmail = useFollowUpsStore((s) => s.updateEmail);
  const toggleEmail = useFollowUpsStore((s) => s.toggleEmail);
  const confirmReview = useFollowUpsStore((s) => s.confirmReview);
  const dismissReview = useFollowUpsStore((s) => s.dismissReview);

  const selectedActionCount = draft?.actions.filter((a) => a.selected).length ?? 0;
  const selectedEmailCount = draft?.emails.filter((e) => e.selected).length ?? 0;
  const canConfirm = selectedActionCount > 0 || selectedEmailCount > 0;
  const showLoading = captureBusy || (generating && !draft);

  return (
    <div className="follow-up-panel">
      <div className="follow-up-panel__body">
        {error ? (
          <p className="follow-up-review__error">{error}</p>
        ) : lastSyncNote && !draft && !generating && !captureActive ? (
          <p className="follow-up-panel__success">{lastSyncNote}</p>
        ) : showLoading ? (
          <div className="follow-up-panel__loading">
            <Loader2 size={20} className="animate-spin text-muted-400" aria-hidden />
            <p>L&apos;IA analyse l&apos;enregistrement et prépare le récap…</p>
          </div>
        ) : captureActive ? (
          <div className="follow-up-panel__capturing">
            <Mic size={18} className="text-emerald-300" aria-hidden />
            <p className="follow-up-panel__capturing-title">Capture en cours</p>
            <p className="follow-up-panel__capturing-hint">
              L&apos;audio est enregistré pendant l&apos;appel. Le récap structuré, les actions
              calendrier et les e-mails seront proposés à la fin de la capture.
            </p>
          </div>
        ) : draft ? (
          <>
            <section className="follow-up-review__recap">
              <h4 className="follow-up-review__section-label">Récap</h4>
              <p>{draft.recap}</p>
            </section>

            <section className="follow-up-review__actions">
              <h4 className="follow-up-review__section-label">
                Actions — validez les échéances calendrier
              </h4>
              {draft.actions.length === 0 ? (
                <p className="follow-up-review__empty-hint">Aucune action détectée.</p>
              ) : (
                <ul className="follow-up-review__list follow-up-panel__list">
                  {draft.actions.map((action) => (
                    <li key={action.id}>
                      <label
                        className={clsx(
                          "follow-up-review__item",
                          action.selected && "follow-up-review__item--selected",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="follow-up-review__checkbox"
                          checked={action.selected}
                          onChange={() => toggleAction(action.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <input
                            type="text"
                            className="follow-up-review__item-title"
                            value={action.title}
                            onChange={(e) =>
                              updateAction(action.id, { title: e.target.value })
                            }
                          />
                          {action.detail && (
                            <span className="follow-up-review__item-detail">{action.detail}</span>
                          )}
                          <span className="follow-up-review__item-schedule">
                            {formatDayLabel(action.dueDate)} ·{" "}
                            {formatScheduleTime(action.startMinutes)}–
                            {formatScheduleTime(action.endMinutes)}
                          </span>
                          <input
                            type="date"
                            className="follow-up-review__item-date"
                            value={action.dueDate}
                            onChange={(e) =>
                              updateAction(action.id, { dueDate: e.target.value })
                            }
                          />
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {draft.emails.length > 0 && (
              <section className="follow-up-review__emails">
                <h4 className="follow-up-review__section-label">
                  <Mail size={13} className="inline mr-1 opacity-70" aria-hidden />
                  E-mails à préparer
                </h4>
                <ul className="follow-up-review__list follow-up-panel__list">
                  {draft.emails.map((email) => (
                    <li key={email.id}>
                      <label
                        className={clsx(
                          "follow-up-review__item",
                          email.selected && "follow-up-review__item--selected",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="follow-up-review__checkbox"
                          checked={email.selected}
                          onChange={() => toggleEmail(email.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <input
                            type="email"
                            className="follow-up-review__item-title"
                            value={email.to}
                            onChange={(e) => updateEmail(email.id, { to: e.target.value })}
                            placeholder="email@exemple.com"
                          />
                          <input
                            type="text"
                            className="follow-up-review__item-subject"
                            value={email.subject}
                            onChange={(e) =>
                              updateEmail(email.id, { subject: e.target.value })
                            }
                            placeholder="Sujet"
                          />
                          <textarea
                            className="follow-up-review__item-body"
                            value={email.body}
                            rows={3}
                            onChange={(e) => updateEmail(email.id, { body: e.target.value })}
                            placeholder="Corps du message"
                          />
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className="follow-up-panel__empty">
            Activez Follow-up pendant un appel vocal pour générer un récap, des actions calendrier
            et des e-mails à valider.
          </p>
        )}
      </div>

      {draft && (
        <div className="follow-up-review__footer">
          <button
            type="button"
            className="follow-up-review__btn follow-up-review__btn--ghost"
            onClick={dismissReview}
          >
            Ignorer
          </button>
          <button
            type="button"
            className="follow-up-review__btn follow-up-review__btn--primary"
            disabled={!canConfirm}
            onClick={() => void confirmReview()}
          >
            <Check size={14} aria-hidden />
            Valider ({selectedActionCount + selectedEmailCount})
          </button>
        </div>
      )}
    </div>
  );
}
