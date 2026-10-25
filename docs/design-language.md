# Mira design language

Mira's screens follow the ideas in Apple's Human Interface Guidelines, translated to Mira's own look (cream surfaces, deep green accent). The goal is a dashboard a shop owner can use without being taught.

## The four ideas
| Idea | In Mira |
|---|---|
| **Clarity** | One large title per screen (`PageHeader`), a quiet subtitle, small caps section labels. Text and controls are big enough to read and hit: 44px controls, 15-16px body text. Labels stay visible above fields; a placeholder is only a hint. |
| **Deference** | The owner's content is the star. Quiet surfaces with hairline edges instead of heavy borders and shadows; one accent colour used sparingly for the main action and the selected item. |
| **Depth** | Three layers only: the page, grouped surfaces (`ui-card`, `ui-group`), and a floating sheet (`Sheet`) for anything that needs focus, such as "Add product". Motion explains where something came from. |
| **Consistency** | One control for one job (below), the same page header everywhere, the same buttons everywhere. |

## Which control for what
- **A single on/off setting** is a **switch** in a list row (`ui-switch`, `SwitchRow`). It applies the moment you flip it, shows "Saved", and snaps back with a reason if saving fails (`useAutoSave`).
- **2-5 related views or modes** is a **segmented control** (`Segmented`, `SegmentedLinks`): filters, chart range, review level. Pass a value that matches no option to show "not answered yet": the thumb hides, so the first option doesn't look selected (used in the setup wizard).
- **Picking one of many (about six or more)** is a grouped list with a checkmark on the chosen row (see the courier step in the setup wizard), not a segmented control.
- **Adding something** is a primary button that opens a **sheet** (`AddSheet`); the list stays the focus. The sheet closes itself after a successful save (`useSheetClose`).
- **A list of things** is an inset **grouped list** (`ui-group` of `ui-row`s).
- **Nothing here yet** is an **empty state** (`EmptyState`): what belongs here, why, and the one next step.
- **Destructive actions** are visually quieter than the main action (`ui-btn-danger`) and ask for confirmation.

## Feedback and control
Every action visibly responds: buttons press in (`active:scale`), a spinner while busy (`aria-busy`), a check when saved, an explanatory error when not (`ErrorNotice`). People can always back out: sheets close with Esc, the backdrop or Done; switches undo themselves on failure.

## Motion
Easing is `--ui-ease` (fast start, soft landing, like iOS). Entrances are short (`ui-enter`), the segmented thumb glides, the switch thumb stretches under the finger. Everything is switched off for people who prefer reduced motion.

## Rules of thumb
1. 8px spacing rhythm; radii 12px (fields, buttons), 20px (cards), 28px (sheets).
2. Text contrast at least slate-500 on white; never slate-400 for anything that must be read.
3. Tap targets at least 44px (`--ui-hit`); small buttons grow on touch screens.
4. Keyboard focus is always visible (a global ring).
5. Prefer plain words to jargon: "Not backed by your info", not "Grounding: low".

## Where the code is
`app/globals.css` (section "Mira UI"), `components/ui/` (PageHeader, SwitchRow, Segmented, Sheet, EmptyState, SaveStatus, useAutoSave).
