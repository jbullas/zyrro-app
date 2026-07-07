# Brief: Brand consistency — no gradient on buttons

Fixes a self-contradiction in `branding-guidelines.md` plus two places the code drifted
from the (correct, more specific) rule: primary buttons are solid orange, secondary/other
buttons are grey, gradient is reserved for non-button brand moments. No gradient on any button.

Scanned every class in `globals.css` using `--gradient`/`--gradient-cta`: `.btn-primary` and
`.btn-cta` are already solid orange (`--color-accent`) — no change needed there. The only two
real violations are below.

## 1. Doc fix — `docs/standards/branding-guidelines.md`

Under "Gradient Placement", the "Always appears in" list currently includes:
```
* CTA buttons (primary actions only)
```
Remove that line. The "Buttons > Primary CTA" section already correctly specifies
`Background: --color-accent` (solid), which is what the code does — the Gradient Placement
list contradicted it for no reason. Leave the rest of the "Always appears in" list as-is
(identity badge, signature score bars, progress bar, step number circles, active card border,
bottom nav active indicator, CTA strip at bottom of report) — those are all real, correct,
non-button gradient uses.

## 2. `.mentor-send-btn` — `app/globals.css`

Currently:
```css
.mentor-send-btn {
  ...
  background: var(--gradient-cta);
  ...
}
```
Change `background` to `var(--color-accent)` — same solid orange as `.btn-primary`/`.btn-cta`.
No other properties change.

## 3. `.mentor-bubble--user` — `app/globals.css`

Currently:
```css
.mentor-bubble--user {
  background: var(--gradient-cta);
  color: #fff;
  border-radius: var(--radius-md) var(--radius-sm) var(--radius-md) var(--radius-md);
  font-size: 15px;
}
```
Change to a neutral grey treatment, consistent with `.btn-secondary`'s tone:
```css
.mentor-bubble--user {
  background: rgba(0,0,0,0.06);
  color: var(--color-text-primary);
  border-radius: var(--radius-md) var(--radius-sm) var(--radius-md) var(--radius-md);
  font-size: 15px;
}
```
Border radius and font-size are unchanged — only background/color.

## Stop conditions

- Do not touch `.btn-primary`, `.btn-cta`, or any other already-solid button — they're correct.
- Do not touch non-button gradient uses (badge, signature bars, progress bar, step/question-number
  circles, active card border, nav active indicator, hero/CTA-strip backgrounds) — those are
  intentional per the guideline and out of scope.
- Do not touch `.mentor-bubble--assistant` — only the user bubble changes.
- Visual check on /mentor: send a message, confirm the user bubble renders grey/neutral (not
  gradient), the send button renders solid orange, and the assistant bubble/loading indicator
  are unaffected.
- Doc-only change to `branding-guidelines.md` needs a diff review, not a local run.
