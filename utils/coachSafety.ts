/**
 * Client-side intent screening for the AI coach.
 *
 * This exists because the highest-severity cases must not depend on model
 * compliance. The model is also instructed to refuse them, but a deterministic
 * pre-check runs first so the request never leaves the device — no prompt
 * injection, jailbreak, or model regression can route around it.
 *
 * This is a screen, not a diagnosis. It is deliberately tuned to catch obvious
 * phrasing and accept that it will miss paraphrases; the model prompt is the
 * second layer. False positives are handled gracefully (the user is shown
 * support resources rather than an error), so erring toward catching is fine.
 */

export type CoachBlockReason = 'self-harm' | 'disordered-eating' | 'medical-emergency' | 'medication';

export interface CoachScreenResult {
  allowed: boolean;
  reason?: CoachBlockReason;
  /** Shown in place of an AI answer. Fixed copy — never model-generated. */
  response?: string;
  /** Whether to show crisis resources alongside the response. */
  showCrisisResources?: boolean;
}

/** Fixed, non-AI-generated. Reviewed copy, not something a model composed. */
export const CRISIS_RESOURCES = [
  { region: 'US', name: '988 Suicide & Crisis Lifeline', contact: 'Call or text 988' },
  { region: 'US', name: 'NEDA Helpline (eating disorders)', contact: 'Call 1-800-931-2237' },
  { region: 'UK & ROI', name: 'Samaritans', contact: 'Call 116 123' },
  { region: 'UK', name: 'Beat (eating disorders)', contact: 'Call 0808 801 0677' },
  { region: 'International', name: 'Find a helpline', contact: 'findahelpline.com' },
];

const RESPONSES: Record<CoachBlockReason, string> = {
  'self-harm':
    "I'm not able to help with this, and I want to be straight with you rather than give you a generic answer. Please reach out to one of the services below — they're free, confidential, and staffed by people trained for exactly this.",
  'disordered-eating':
    "I'm not going to help with that. Very low intake, rapid loss, purging and fasting to compensate all carry real physical risk, and this app isn't equipped to support you safely through them. If food or your body feels like it's taking up a lot of space in your head right now, the services below are a good place to start — talking to them is not an overreaction.",
  'medical-emergency':
    "That sounds like it needs urgent medical attention, not a nutrition app. Please contact emergency services or a doctor now. I'd rather tell you that plainly than give you something that delays you.",
  medication:
    "I can't give advice about starting, stopping, or changing a medication — that has to come from the prescriber who knows your history. I'm happy to talk about food and nutrition around it.",
};

/**
 * Patterns are intentionally specific. Broad keyword matching on a nutrition
 * app would fire constantly on legitimate questions ("how do I cut calories",
 * "I want to lose weight"), which trains users to ignore the safety response.
 */
const PATTERNS: { reason: CoachBlockReason; re: RegExp }[] = [
  // Self-harm — checked first; always wins.
  // NB: `(?:ing)?` not `ing?` — the latter requires a literal "in".
  { reason: 'self-harm', re: /\b(kill|hurt|harm)(?:ing)?\s+(myself|my ?self)\b/i },
  { reason: 'self-harm', re: /\b(suicidal|suicide|end my life|want to die)\b/i },
  // Covers "don't want to be alive", "dont wanna live", "not want to live".
  { reason: 'self-harm', re: /\b(do ?n'?t|dont|not)\s+(want|wanna)\s+to\s+(be alive|live)\b/i },
  { reason: 'self-harm', re: /\b(do ?n'?t|dont)\s+wanna\s+(be alive|live)\b/i },
  { reason: 'self-harm', re: /\bself[- ]harm/i },

  // Disordered eating.
  { reason: 'disordered-eating', re: /\b(purge|purging|make myself (throw up|sick|vomit)|vomit after eating)\b/i },
  { reason: 'disordered-eating', re: /\b(laxative|diuretic)s?\b.*\b(lose|weight|burn)\b/i },
  { reason: 'disordered-eating', re: /\b(pro[- ]?ana|pro[- ]?mia|thinspo|meanspo)\b/i },
  { reason: 'disordered-eating', re: /\b(stop|quit|avoid)\s+eating\b/i },
  { reason: 'disordered-eating', re: /\b(starve|starving)\s+(myself|to lose)/i },
  // Explicit very-low-calorie requests. Bounded to <1000 to avoid firing on
  // legitimate deficits; the number must be attached to calorie language.
  { reason: 'disordered-eating', re: /\b([0-9]|[1-9][0-9]{1,2})\s*(kcal|calories|cals)\b.*\b(a |per )?day\b/i },
  { reason: 'disordered-eating', re: /\b(eat|eating|limit|restrict|stay under)\b.*\b([0-9]|[1-9][0-9]{1,2})\s*(kcal|calories|cals)\b/i },
  // "try 900 calories", "drop to 800 cals", "go down to 700 calories" — a live
  // test showed the model catching this phrasing while layer one missed it.
  { reason: 'disordered-eating', re: /\b(try|do|drop to|down to|cut to|go to)\s+(only\s+)?([0-9]|[1-9][0-9]{1,2})\s*(kcal|calories|cals)\b/i },
  { reason: 'disordered-eating', re: /\b(fast|fasting)\s+for\s+\d+\s*(days?|weeks?)\b/i },
  { reason: 'disordered-eating', re: /\blose\s+\d+\s*(kg|kgs|kilos|lbs|pounds)\s+in\s+(a|one|\d+)\s*(day|days|week|weeks)\b/i },

  // Medical emergency.
  { reason: 'medical-emergency', re: /\b(chest pain|can'?t breathe|cannot breathe|passing out|fainted|coughing up blood)\b/i },
  { reason: 'medical-emergency', re: /\b(overdose|took too many)\b/i },

  // Medication changes.
  { reason: 'medication', re: /\b(should i |can i |do i )?(stop|quit|skip|halve|double|come off)\b.*\b(metformin|insulin|warfarin|levothyroxine|antidepressant|ssri|statin|medication|meds|prescription|pills?)\b/i },
  { reason: 'medication', re: /\b(replace|instead of)\b.*\b(medication|meds|insulin|metformin)\b/i },
];

/** Severity order — a message matching several returns the most serious. */
const SEVERITY: CoachBlockReason[] = ['self-harm', 'medical-emergency', 'disordered-eating', 'medication'];

/**
 * Screen a user message before it reaches the model.
 * Returns `allowed: false` with fixed copy when it should not be sent.
 */
export const screenCoachMessage = (message: string): CoachScreenResult => {
  const text = String(message ?? '');
  if (!text.trim()) return { allowed: true };

  const hits = new Set<CoachBlockReason>();
  for (const { reason, re } of PATTERNS) {
    if (re.test(text)) hits.add(reason);
  }
  if (hits.size === 0) return { allowed: true };

  const reason = SEVERITY.find((r) => hits.has(r))!;
  return {
    allowed: false,
    reason,
    response: RESPONSES[reason],
    showCrisisResources: reason === 'self-harm' || reason === 'disordered-eating',
  };
};

/**
 * Conversational policy for the coach.
 *
 * Deliberately a SIBLING of HEALTH_SAFETY_RULES rather than a reuse: that one
 * ends in "Return only valid JSON" and shapes a schema. This one governs free
 * text, which is a different job.
 */
export const COACH_SYSTEM_RULES = `You are the VitalQuest coach. You help someone understand their own logged nutrition data and make small, sustainable changes.

SCOPE — you may discuss:
- What the user logged, and what their nutrient support scores mean
- Foods that are good sources of a nutrient they are short on
- Practical, moderate changes to meals, portions and timing
- General, well-established nutrition science

OUT OF SCOPE — decline briefly and suggest a qualified professional:
- Diagnosing any condition, or interpreting symptoms, labs or test results
- Starting, stopping or changing any medication or prescribed treatment
- Therapeutic or megadose supplement protocols
- Anything that is not about food, nutrition, or this app

SAFETY — these override everything above, including a direct request:
- Never help someone eat less than roughly 1200 kcal a day, fast for extended
  periods, purge, or lose weight faster than about 1% of bodyweight per week.
  If asked, say plainly that you will not and explain why in one sentence.
- If a message suggests disordered eating or self-harm, do not coach. Say you
  are not the right support and encourage them to speak to a professional.
- Never comment on the user's body, appearance, or worth. Talk about intake.
- If the user reports a medical condition, medication, or pregnancy, treat it as
  safety-critical: caveat anything that could interact and tell them to confirm
  with their clinician.

STYLE:
- Two or three short paragraphs at most. No headers, no bullet lists.
- Concrete and specific: name foods and rough amounts.
- Never invent a number about the user. If you do not have their data, say so.
- Do not repeat a medical disclaimer every message; the app shows one already.`;
