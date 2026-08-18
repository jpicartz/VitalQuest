# v2 Surface Inventory

Every reachable surface in v1, and where it lands in v2. **Nothing moves until this
file is complete**, because a dropped surface produces no error, no failing test,
and no visual glitch — the only thing that catches one is walking this list.

**v1:** 4 tabs + 3 sub-tabs = 7 navigation targets.
**v2:** 4 tabs + a profile sheet.

| v2 destination | Its one job |
|---|---|
| **Today** | Log what I ate |
| **Body** | Understand what it did to me |
| **Goal** | Know where I'm heading and what to do now |
| **Coach** | Ask why |
| **Profile sheet** | Everything that isn't a daily destination |

---

## Today  ← *Nutrition ▸ Food Log*

| # | Surface | v1 location | Notes |
|---|---|---|---|
| 1 | Date navigator (prev / next / label) | NutritionTracker log | Keep at top |
| 2 | Calories Remaining ring | NutritionTracker log | The hero number |
| 3 | Water progress + `+250` / `+500` / Custom / Reset | NutritionTracker log | Today-only; already hidden on past days |
| 4 | Sunlight button → modal | NutritionTracker log | Modal #1 to re-home |
| 5 | Meal Builder button → modal | NutritionTracker log | Modal #2 |
| 6 | Favourites collapsible + meal-type select + quick add | NutritionTracker log | |
| 7 | Four meal cards (Breakfast/Lunch/Dinner/Snack) | NutritionTracker log | Per-food star + delete |
| 8 | Add Food → AI panel (text + **mic**) | NutritionTracker log | Voice lives here |
| 9 | Water custom-amount modal | NutritionTracker root | Modal #3 |
| 10 | Reset Today's Log → confirm modal | NutritionTracker header | Modal #4 |
| 11 | Past-day banner | NutritionTracker log | |
| 12 | Recipe modal (from Meal Builder) | RecipeModal | Modal #5 |

## Body  ← *Nutrition ▸ Analysis + Trends snapshot*

| # | Surface | v1 location | Notes |
|---|---|---|---|
| 13 | **Body System Support** — 7 rings | Analysis | The signature surface; lead with it |
| 14 | System detail sheet + "Ask why" | BodySystems | Modal #6 → entry to Coach |
| 15 | Micronutrient Score hero | Analysis | Keep — it is the `nutrition-nerd` badge input |
| 16 | Calorie Breakdown donut | Analysis | |
| 17 | Macro Targets bars | Analysis | |
| 18 | Micronutrient Breakdown grid (26 tiles) | Analysis | Now *below* the systems — detail, not headline |
| 19 | Nutrient detail modal | NutritionTracker root | Modal #7 |
| 20 | What You're Missing Today | Analysis | |
| 21 | Micronutrient Snapshot (10 priority rows) | **Trends** | ⚠️ Moving tabs — easy to drop |
| 22 | Daily Summary (water + weight) | Analysis | ⚠️ Known bug: ignores `selectedDate` |
| 23 | Export PDF + error | Analysis | `reportRef` wraps this whole stack — keep contiguous |

## Goal  ← *Progress + Quests + Trends charts*

| # | Surface | v1 location | Notes |
|---|---|---|---|
| 24 | Goal panel: set / edit / clear, refusals, suggestion | Progress | Already built |
| 25 | Today's calorie target + pace verdict | Progress | |
| 26 | Body Weight: starting / current / change | Progress | |
| 27 | Weight chart (last 14) | Progress | |
| 28 | Log weight input + button | Progress | |
| 29 | Exercise list + Log button → modal | Progress | Modal #8 |
| 30 | **Today's Goals (quests)** + progress bar | **Quests tab** | ⚠️ Whole tab collapses in here |
| 31 | Trend charts (calories / protein / macro) + 7·14·30 selector | **Trends** | ⚠️ Moving tabs |
| 32 | AI weekly insights | **Trends** | ⚠️ Moving tabs |

## Coach

| # | Surface | v1 location | Notes |
|---|---|---|---|
| 33 | Coach conversation | Coach | Modal #9; entered from #14 |
| 34 | Safety-screen responses + crisis resources | Coach | Must survive re-homing |

## Profile sheet  ← *the rest*

| # | Surface | v1 location | Notes |
|---|---|---|---|
| 35 | **PlanDisplay** — summary, strengths, gaps, supplements | **My Plan tab** | ⚠️ Carries `safetyDisclaimer`, per-supplement `caution`, and the `isFallback` banner. Do **not** bury inside Goal. |
| 36 | Achievements: earned + locked badges | Progress | |
| 37 | Stats 2×2 (XP / Level / Streak / Badges) | Progress | |
| 38 | Start Over → confirm modal | Dashboard footer | Modal #10 |

## Always visible (app shell — unchanged)

| # | Surface |
|---|---|
| 39 | Header: level ring, XP, streak, kcal |
| 40 | Badge chip row |
| 41 | Nav: logo, XP pill, theme toggle |
| 42 | Footer: medical + privacy disclaimer |

---

## Cuts — deliberate, not accidental

| Surface | Why |
|---|---|
| The word "Nutrition" as a destination | Split into Today (logging) and Body (understanding). Nothing is lost; the container disappears. |
| "Trends" as a destination | Its three contents move: charts + insights → Goal, snapshot → Body. |
| "My Plan" as a top-level tab | Becomes the profile sheet. Read once after onboarding, then rarely — it does not earn a permanent slot. |

## Risks specific to this move

1. **Ten modals** to re-home. Splitting `NutritionTracker` orphans its five one at a time.
2. **`reportRef`** wraps the whole Analysis stack for PDF export — reordering changes the exported report.
3. **`activeTab` is `useState`, not URL state.** Body → Coach must carry a subject across tabs. Move nav to the URL hash; it also buys back-button and deep-links, which the app has never had.
4. **Rows 21, 30, 31, 32, 35** change tabs entirely. These are the most likely to be silently dropped.

## Verification

Walk rows 1–42 against the running app. Every row must be reachable or listed
as an explicit cut. Phase 0's smoke tests break by design here — rewriting them
to the new IA *is* the migration checklist.

### Result of the walk (2026-08-16)

**41 of 42 rows verified live. One was dropped, and it was a predicted one.**

| | |
|---|---|
| Rows 1–12 (Today) | ✅ including all five modals |
| Rows 13–23 (Body) | ⚠️ **row 21 was dropped** — see below. 22 others ✅ |
| Rows 24–32 (Goal) | ✅ |
| Rows 33–34 (Coach) | ✅ 33 live; **34 covered by `coachSafety.test.ts`, not exercised live** (needs a real message) |
| Rows 35–38 (Profile sheet) | ✅ including the disclaimer and per-supplement caution |
| Rows 39–42 (Shell) | ✅ |

**Row 21 — Micronutrient Snapshot — was silently dropped.** It lived in the
Trends sub-tab; Trends was retired; nothing referenced it afterwards. Exactly the
failure this document exists to catch: no error, no failing test, no visual
glitch. It is now in Body, below the Micronutrient Score, and covered by a test
that fails if it disappears again.

Worth recording honestly: **the rewritten smoke tests did not catch it.** They
were written from the new IA rather than mechanically from these 42 rows, so
they asserted what the new Body tab *does* show instead of what it *must*. Only
the row-by-row walk found it. Write the next migration's tests from the
inventory, row by row, not from the finished screen.

**Also corrected during the walk:** Body System Support was rendering *fifth* on
the Body tab despite row 13 saying "lead with it". It now leads, inside
`reportRef`, so the exported PDF leads with it too.
