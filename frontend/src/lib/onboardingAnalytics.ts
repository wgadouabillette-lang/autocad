import {
  ONBOARDING_QUESTIONS,
  type OnboardingQuestionId,
} from "./onboardingSurvey";
import { trackMixpanel } from "./mixpanel";

/** Mixpanel Funnels steps, welcome through the payment page. */
const FUNNEL_EVENTS: Record<string, string> = {
  welcome: "Onboarding Welcome",
  plan: "Onboarding Plan",
  purpose: "Onboarding Purpose",
  source: "Onboarding Source",
  choose: "Onboarding Seats",
  pay: "Onboarding Pay",
};

const CHOICE_EVENTS: Record<OnboardingQuestionId, string> = {
  plan: "Onboarding Plan Choice",
  purpose: "Onboarding Purpose Choice",
  source: "Onboarding Source Choice",
};

const seenSteps = new Set<string>();
const seenChoices = new Set<string>();

export function trackOnboardingStep(uid: string, step: string): void {
  const event = FUNNEL_EVENTS[step];
  if (!event) return;
  const key = `${uid}:${step}`;
  if (seenSteps.has(key)) return;
  seenSteps.add(key);
  trackMixpanel(uid, event, { step });
}

export function trackOnboardingChoice(
  uid: string,
  questionId: OnboardingQuestionId,
  choiceId: string,
): void {
  const question = ONBOARDING_QUESTIONS.find((item) => item.id === questionId);
  const choice = question?.choices.find((item) => item.id === choiceId);
  if (!question || !choice) return;
  const key = `${uid}:${questionId}:${choice.id}`;
  if (seenChoices.has(key)) return;
  seenChoices.add(key);
  trackMixpanel(uid, CHOICE_EVENTS[questionId], {
    question: question.title,
    choice: choice.label,
  });
}
