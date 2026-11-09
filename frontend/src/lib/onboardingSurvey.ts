import { getAnalytics, isSupported, logEvent } from "firebase/analytics";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "./firebase/config";
import { db, firebaseApp } from "./firebase/client";

export type OnboardingQuestionId = "plan" | "purpose" | "source";

export interface OnboardingChoice {
  id: string;
  label: string;
  icon?: string;
}

export interface OnboardingQuestion {
  id: OnboardingQuestionId;
  title: string;
  subtitle: string;
  choices: OnboardingChoice[];
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "plan",
    title: "How do you plan on using Meetra?",
    subtitle: "Choose the setup that matches how you'll work.",
    choices: [
      { id: "solo", label: "On my own" },
      { id: "colleague", label: "With colleagues" },
      { id: "friends", label: "With friends" },
      { id: "other", label: "Other" },
    ],
  },
  {
    id: "purpose",
    title: "What will you use Meetra for?",
    subtitle: "Pick the one that fits you best.",
    choices: [
      { id: "automation", label: "AI automation" },
      { id: "agent", label: "AI agent" },
      { id: "calendar", label: "Calendar" },
      { id: "notes", label: "AI Notes" },
      { id: "recording", label: "Demo recording" },
      { id: "all", label: "All the above" },
    ],
  },
  {
    id: "source",
    title: "Where did you hear about us?",
    subtitle: "Tell us how you found Meetra.",
    choices: [
      { id: "youtube", label: "YouTube", icon: "icons/sources/youtube.svg" },
      { id: "instagram", label: "Instagram", icon: "icons/sources/instagram.svg" },
      { id: "tiktok", label: "TikTok", icon: "icons/sources/tiktok.svg" },
      { id: "google", label: "Google", icon: "icons/sources/google.svg" },
      { id: "colleague", label: "Colleague" },
      { id: "x", label: "X", icon: "icons/sources/x.svg" },
      { id: "enterprise", label: "Enterprise" },
      { id: "other", label: "Other" },
    ],
  },
];

export type OnboardingAnswers = Record<OnboardingQuestionId, string>;

function choiceLabel(questionId: OnboardingQuestionId, choiceId: string): string {
  const question = ONBOARDING_QUESTIONS.find((item) => item.id === questionId);
  return question?.choices.find((choice) => choice.id === choiceId)?.label ?? choiceId;
}

function isCompleteAnswers(answers: Partial<OnboardingAnswers>): answers is OnboardingAnswers {
  return ONBOARDING_QUESTIONS.every((question) =>
    question.choices.some((choice) => choice.id === answers[question.id]),
  );
}

async function logOnboardingAnalytics(answers: OnboardingAnswers): Promise<void> {
  if (!firebaseConfig.measurementId) return;
  try {
    if (!(await isSupported())) return;
    const analytics = getAnalytics(firebaseApp);
    for (const question of ONBOARDING_QUESTIONS) {
      logEvent(analytics, "onboarding_answer", {
        question_id: question.id,
        choice_id: answers[question.id],
      });
    }
  } catch {
    // Analytics stays optional when the desktop runtime cannot start it.
  }
}

/** Stores one answer set per account and increments the choice totals. */
export async function recordOnboardingAnswers(
  uid: string,
  answers: Partial<OnboardingAnswers>,
): Promise<void> {
  if (!isCompleteAnswers(answers)) {
    throw new Error("Onboarding answers are incomplete.");
  }
  const responseRef = doc(db, "onboardingResponses", uid);
  const statRefs = ONBOARDING_QUESTIONS.map((question) => ({
    question,
    choiceId: answers[question.id],
    ref: doc(db, "onboardingStats", `${question.id}__${answers[question.id]}`),
  }));

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(responseRef);
    if (existing.exists()) return;
    const stats = [];
    for (const item of statRefs) {
      stats.push(await transaction.get(item.ref));
    }

    transaction.set(responseRef, {
      plan: answers.plan,
      purpose: answers.purpose,
      source: answers.source,
      createdAt: serverTimestamp(),
    });

    statRefs.forEach((item, index) => {
      const snap = stats[index];
      const label = choiceLabel(item.question.id, item.choiceId);
      if (!snap.exists()) {
        transaction.set(item.ref, {
          questionId: item.question.id,
          questionLabel: item.question.title,
          choiceId: item.choiceId,
          label,
          count: 1,
          updatedAt: serverTimestamp(),
        });
        return;
      }
      const count = Number(snap.data()?.count ?? 0);
      transaction.update(item.ref, {
        count: Number.isFinite(count) ? count + 1 : 1,
        updatedAt: serverTimestamp(),
      });
    });
  });

  void logOnboardingAnalytics(answers);
}
