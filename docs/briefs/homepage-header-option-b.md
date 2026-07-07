# Brief: Homepage uses the real shared Header (Option B)

Removes the homepage's duplicated nav markup in favor of the actual global `Header` component
that already wraps every other page via `app/layout.tsx`. This is a deliberate behavior change,
not just a refactor — confirmed with Jeff/Miroslav before starting (see below).

## Background

`app/layout.tsx` already renders `<Header />` above `{children}` on every route. `Header.tsx`
has `if (pathname === '/') return null;`, which exists specifically because the homepage
(`app/page.tsx`) has always rendered its own hand-coded nav row, embedded inside its
`.hero-section`, instead. That's real duplicated markup — this brief removes it.

## Confirmed behavior changes (intended, not bugs)

- **Logged-in visitors to `/` will now see the account-avatar circle** instead of always
  seeing the login icon. Homepage's own nav never had the avatar-initials logic `Header` has —
  this brings it in line with every other page.
- **The nav becomes a separate sticky bar** (`Header`'s `sticky top-0 z-50`), rather than being
  embedded as the top of the scrolling gradient hero section. It'll still read as one
  continuous gradient visually (both use the same `--gradient` background), but it no longer
  scrolls away with the hero content.

## Changes

### 1. `components/Header.tsx`
Remove the early return:
```tsx
if (pathname === '/') return null;
```
(and the now-unused `pathname`/`usePathname` if nothing else in the file needs it — check
before removing the import).

### 2. `app/page.tsx`
Remove the homepage's own nav block — currently sitting inside `.hero-section`, before
`.hero-content`:
```tsx
{/* Nav */}
<div className="nav-spacer" />
<div className="nav-bar" style={{ padding: '8px 16px 0' }}>
  <div />
  <div className="nav-center">
    <a href="/">
      <img src="https://zyrro.ai/images/logo_300px.png" alt="Zyrro" className="nav-logo" />
    </a>
  </div>
  <div className="nav-end">
    <a href="/login" className="nav-icon-link" aria-label="Log in">
      <IconLogin size={28} stroke={1.75} />
    </a>
  </div>
</div>
```
Delete this whole block. `.hero-section` should now start directly with the `{/* Hero content */}`
comment and `.hero-content` div. Remove the now-unused `IconLogin` import from `app/page.tsx`
if nothing else in the file uses it.

## Stop conditions

- Do not change `Header.tsx`'s account-avatar logic, `showLogin` prop, or anything else in the
  component beyond removing the one early-return line (and its now-dead import, if applicable).
- Do not touch `BottomNav.tsx`, `GatedState.tsx`, or any other component.
- Do not touch any other page — this is homepage-only.
- Visual check on `/`, logged out: confirm the sticky Header renders at the top with the login
  icon, hero content starts right below it with reasonable spacing (no awkward gap or overlap),
  and the gradient reads as continuous.
- Visual check on `/`, logged in (use the magic-link test-session pattern): confirm the
  account-avatar circle now renders instead of the login icon.
- Confirm no other route regressed — spot-check one or two (e.g. `/start`) to confirm `Header`
  still renders normally there (it always did; this is just confirming the code change didn't
  affect the shared component's behavior elsewhere).
