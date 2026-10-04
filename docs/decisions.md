# Decision record

The non-obvious choices in VitalQuest, and the reasoning behind them. Written so
that a reviewer — or a future me — can tell which decisions were deliberate and
which were accidents, and can overturn one on purpose rather than by drift.

Each entry states the decision, why, and what would have to change to reverse it.

---

## 1. Arithmetic and safety rules live in code, never in a prompt

**Decision.** The model is never asked to multiply, and never asked to enforce a
safety rule.

**Why.** Both were tried and both failed in ways that were invisible until
someone checked the numbers.

Asked to log "5 eggs", the model returned per-100g USDA values while labelling
the serving "5 eggs" — a ~2.5× undercount. Instructing it to multiply
overcorrected to roughly 4× the true value. The working design has the model
return per-unit values plus a quantity, and `scaleParsedFood()` does the
multiplication in JavaScript.

The same principle governs the eating-disorder guardrails. They are pure
functions in `utils/goalProjection.ts`, not prompt text: a calorie tracker with
an AI coach has real exposure here, and a prompt is the weakest possible place
for the highest-severity rule in the product. The coach then inherits a system
that *already* refuses dangerous targets, and adds a second, client-side intent
screen that runs before any network request.

**To reverse:** you would need evidence that a model does reliable arithmetic
over ambiguous serving sizes, and a reason why refusals belong somewhere a
prompt injection can reach.

---

## 2. Body systems are framed as *support*, never as a *grade*

**Decision.** Every label reads "<System> support". A test asserts the word
"grade" appears nowhere in the component.

**Why.** The app observes what you logged. It cannot observe your skin, your
hair, or your hormones. "Skin grade: 62" claims a measurement that was never
taken; "Skin support: 62%" describes the intake, which is exactly what was
computed. This is the same class of honesty problem as the medications field
that was collected and never read (§7).

**To reverse:** you would need an actual measurement — a lab panel, a photo
analysis with validated accuracy — not a better-sounding label.

---

## 3. Two contexts split by write frequency, not one AppContext

**Decision.** `ProfileContext` (profile, metrics, plan, targets) is separate
from `LogsContext`, and logs data is separate from log *actions*.

**Why.** Profile data is effectively immutable after onboarding; logs change
constantly. A single `AppContext` would re-render every profile consumer on each
water click. Splitting data from actions means a component that only needs
`onLogWater` never re-renders when a keystroke changes the food input.

`LogsProvider` routes App's handlers through a ref, because they are not
memoized. That keeps the actions value referentially stable without requiring
`useCallback` on eleven functions and hoping nobody forgets one later.

**To reverse:** a state library (Zustand, Jotai) would subsume this. Worth it if
the app grows a server; overkill for a single-user localStorage app.

---

## 4. Gamification is retained but demoted

**Decision.** XP, levels, streaks, quests and badges all still exist, but the
Body tab — not the quest list — is the app's headline.

**Why.** The hard part of nutrition is not knowing, it is continuing, and
streaks genuinely help with that. But leading with them makes the app read as a
game with a nutrition theme rather than a nutrition tool. `computeMicroScore` is
deliberately retained as the `nutrition-nerd` badge input even though body
systems replaced it visually — removing the function would make that badge
silently unreachable.

---

## 5. Seven navigation targets became four

**Decision.** Today / Body / Goal / Coach, plus a profile sheet. The v1 IA was
four tabs plus three nutrition sub-tabs.

**Why.** Seven targets with no clear answer to "which one do I open?". Adding
Goal and Coach as *new* tabs would have made nine. Each destination now answers
exactly one question.

`PlanDisplay` went to the profile sheet rather than into Goal specifically
because it carries the AI safety disclaimer, per-supplement cautions and the
`isFallback` banner. Burying the medical-safety surface inside a
weight-projection tab weakens it.

**Method worth reusing:** `docs/v2-surface-inventory.md` mapped all 42 reachable
surfaces to their new home *before* anything moved. One was still dropped
silently — a dropped surface produces no error, no failing test, and no visual
glitch — and only the row-by-row walk against the running app caught it.

---

## 6. Photo meal-logging was cut, permanently

**Decision.** No image input. `messagesAreTextOnly()` in `api/claude.ts` is a
permanent control, not a temporary narrowing.

**Why.** The accuracy needed to put a calorie number on a plate from a
photograph is not there. A confidently wrong number in a health app is worse
than no feature — it is the same failure mode as §7, a promise the code cannot
keep.

**Consequence:** any future change that relaxes the text-only rule is a security
regression with no user-facing justification, since nothing in the product needs
image content. The comment in `api/claude.ts` says so.

---

## 7. No account, no database

**Decision.** All state in `localStorage`. No auth, no backend store. Every
access goes through `utils/safeStorage.ts`, which cannot throw.

**Why.** Nothing to breach, nothing to sell, no data-retention policy to write
around. For a single-user health tracker the trade is strongly favourable.

**Honestly stated:** this caps what the product can become. No sync across
devices, no sharing with a clinician, no recovery if the browser store is
cleared. That was accepted knowingly, not overlooked.

**What it cost:** writes were unguarded for a long time, and `setItem` throws
outright in Safari private browsing — so the app crashed on first render there,
in production, until an audit caught it. When persistence *is* the architecture,
the failure path is not an edge case; it is the architecture failing. A failed
write now surfaces a banner rather than being swallowed, because silently not
saving is the same class of dishonesty as the medications field in §2.

---

## 8. The proxy rebuilds every request; errors are opaque

**Decision.** `api/claude.ts` never forwards a request body verbatim. 12
rejection paths, all tested.

**Why.** An unprotected AI proxy is a way to spend someone else's money. The
non-obvious ones:

- **Rate limiting keys on Vercel's edge-set headers**, not `x-forwarded-for` —
  that header is caller-supplied, so the original limiter was decorative.
- **Content is text-only** because the Messages API accepts image blocks with a
  *URL* source, which would make Anthropic fetch arbitrary URLs on this key.
- **Upstream errors are not echoed**, because Anthropic's error body reveals
  whether the key is valid and whether the account has credit.

**Honestly stated:** the rate limiter is per-instance best-effort, not
distributed. The Anthropic spend cap is the real backstop. This is written in
the code comments too — pretending a defence is stronger than it is helps
nobody.

---

## 9. The coach has no canned fallback

**Decision.** Unlike `suggestMeals` and `generateNutritionInsights`, which fall
back to canned content on error, the coach says it is unavailable.

**Why.** Canned text must never appear to answer a restriction-seeking question.
A generic string rendered in a coach bubble reads as a considered reply to
whatever was just asked.

---

## 10. Tests are the evidence, so they hold still during refactors

**Decision.** During the context extraction, `test/renderWithApp.tsx` was built
to accept the same flat object components previously took as props, so no
assertion changed.

**Why.** The tests are the only evidence that a refactor changed nothing a user
can see. Rewriting them in the same commit as the code destroys that evidence.

**Two lessons paid for the hard way:**

- **Write migration tests from the inventory, row by row — not from the finished
  screen.** Tests written from the new design assert what the new screen *does*
  show, rather than what it *must*. That is how the dropped surface in §5 got
  past a full test rewrite.
- **A test whose fixture guarantees the property is worse than no test.** One
  test asserted two parts of the Body tab always name the same nutrient. It
  passed only because its fixture arranged the data that way; real data
  disproved it immediately. It manufactured confidence. It is now scoped to the
  guarantee that actually holds.

---

## 11. The prompt's nutrient list is generated from the reference data

**Decision.** `MICRO_KEYS` is exported from `data/nutrientData.ts`, and the parse
prompt's JSON skeleton and its unit declaration are both built from it at module
load. Neither is written out by hand.

**Why.** They drifted. `NUTRIENT_INFO` scored Copper in mcg against a 900 target
while the prompt's mcg list omitted it, so the model returned mg — about 0.9 for
a normal day — and the app displayed 0.1% DV. It is the worst shape a bug can
take in this app: not a crash, not a blank, but a plausible small number that
reads as "you are deficient in copper" every single day. A hand-written copy of
a list in a prompt is a second source of truth, and this one was wrong for as
long as nobody multiplied it out.

Copper is now stored in **mg with a 0.9 target** — the same RDA as 900 mcg —
rather than forcing the unit in the prompt, because the model returns mg for
copper regardless of what it is told. USDA tables use mg and that prior wins.
**Match the model where it is reliably consistent; constrain it in code where it
is not.**

**Reverse this if** a nutrient needs a unit the model will not produce. Then the
conversion belongs in `normalizeMicros`, in code, next to the other coercions —
not in the prompt.

---

## 12. Model compliance is measured, not assumed

**Decision.** `normalizeMicros` fills every tracked nutrient at 0, so a food
always carries all 28 keys. `parseFoodLog` then counts how many the model
actually reported and retries once when a food comes back below 75% of them,
keeping whichever attempt reported more.

**Why.** The prompt instructs the model to return every key, and compliance is
unreliable in a way that only shows up on repeated calls: the same request came
back 28 of 28 per food on one call and roughly half on the next. A dropped key
is invisible — it is indistinguishable in the UI from a food that genuinely
contains none of that nutrient, so the user is simply told they ate no vitamin D.

This is §1 applied to a case where the rule is easy to miss, because the prompt
*looks* like it is handling it. An instruction in a prompt is a request. The
guarantee has to be in code.

Two limits, stated rather than papered over:

- **The fill cannot recover an omitted value.** It guarantees the shape, not the
  number, which is why the prompt still insists on every key and why the retry
  exists at all.
- **The retry threshold is a cost trade.** Retrying on one missing trace value
  would double the cost of every parse. 75% catches "half the vitamins vanished"
  and ignores a single absent nutrient.

**An earlier instruction caused this.** The prompt once said to *omit* any
nutrient whose value would be zero, to save output tokens. The model read that
as licence to drop real values: Biotin disappeared from eggs entirely. Never
optimise an AI response by asking for less of the data the app depends on.

---

## 13. One aggregation per quantity

**Decision.** `sumMacros` and `computeConsumedMicros` are the only places the
day's totals are computed. `NutritionTracker` had its own identical copy of the
macro reduce; it is gone.

**Why.** Both arithmetic bugs found in this area survived because a fix was
applied to one copy and missed in the other — the NaN guard, and the
`selectedDate` filter. Two definitions of "what today adds up to" do not stay
equal, and the failure is silent: two surfaces disagree and neither is obviously
wrong. Making the function exported and shared is cheaper than a test asserting
the two copies match.
