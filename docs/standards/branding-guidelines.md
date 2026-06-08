# Zyrro Branding Guidelines

# Logo

[zyrro-logo.png on Google Drive](https://drive.google.com/open?id=15Iq_qn9ieaPLgt5mYHfUu0rG-lNZ4xtx)

## Usage

### Full logo (icon \+ word)

Used in the header on every screen, consistently. Always on gradient background. Wordmark colour on gradient: \#FFFFFF (always), never dark text on gradient.

### Icon mark only

Not currently used in the app UI. Reserved for favicon, app icon, social avatar. 28×28px minimum in UI contexts.

# Colors

All colour values are defined as CSS variables in `globals.css`. Use these tokens — never hardcode hex values.

| Role | Variable |
| :---- | :---- |
| Background | `--color-bg` |
| Primary text | `--color-text-primary` |
| Secondary text | `--color-text-secondary` |
| Accent | `--color-accent` |
| Surface | `--color-surface` |
| Gradient stop 1 | `--color-grad-1` |
| Gradient stop 2 | `--color-grad-2` |
| Gradient stop 3 | `--color-grad-3` |
| Nav active | `--color-nav-active` |
| Nav inactive | `--color-nav-inactive` |

## Gradient

### Definition

The Zyrro gradient is the primary brand expression. It is not decorative — it signals identity, action, and Zyrro moments.

### Specification

Use `--gradient` (brand gradient) or `--gradient-cta` from `globals.css`. Never write the gradient value inline.

### Placement

Every time the gradient appears, something meaningful is happening — a brand moment, a key action, or an identity signal. It should never feel like wallpaper.

Always appears in:

* Application header (full surface, every screen)  
* Identity badge (the named identity card on dashboard)  
* CTA buttons (primary actions only)  
* Signature score bars  
* Progress bar (question flow)  
* Step number circles  
* Active card border (gradient outline, 1.5px)  
* Bottom nav active indicator (top edge of active tab)  
* CTA strip at bottom of report

Never appears in :

* Body/content backgrounds  
* Secondary text, labels, metadata  
* Locked/inactive states  
* Card backgrounds

## Background

* `--color-bg` — all content/body areas.
* Never use `--color-grad-3` as a flat background. The gradient is the brand expression — flat purple is not.

## Icons

* header UI icons (share, login): rgba(255,255,255,0.85)
* nav: `--color-text-primary`

# Typography

## Typeface

System font stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
```

## Weights

Use CSS variables from `globals.css`:
`--font-weight-regular` · `--font-weight-medium` · `--font-weight-semibold` · `--font-weight-bold`

Font size scale: `--font-size-display` · `--font-size-heading` · `--font-size-subheading` · `--font-size-body` · `--font-size-label` · `--font-size-micro`

# Iconography

## Identity Badge

Identity badge: 80x88px SVG shield path with brand gradient fill. Tabler icon 28px (rgba(255,255,255,0.95)) centred inside, determined by user's #1 primary signature. See docs/standards/identity-signature-icons.md for icon mapping and shield path spec.

## Icons

Tabler Icons (ti- prefix). All UI icons drawn from this set exclusively.

* Dashboard: ti-layout-dashboard  
* Identity: ti-shield  
* Path: ti-arrow-fork  
* Plan: ti-calendar  
* Mentor: ti-compass  
* Login: ti-login (pre-registration only)  
* Share: ti-share  
* Arrow: ti-arrow-right (active/CTA)

# Component patterns

## Header

* Background: brand gradient  
* Height: auto — status bar \+ nav row \+ optional greeting  
* Logo full wordmark left, login/account icon right  
* No page titles.  
* No back links.  
* Navigation via bottom nav only.

## Bottom Navigation

* Background: `--color-surface`
* Border top: 0.5px solid rgba(0,0,0,0.07)
* Active indicator: 2px `--gradient` bar at top edge, 24px wide, centered on active tab
* Label: `--color-text-primary`

## Cards

* Background: `--color-surface`
* Border radius: `--radius-card`; Border: 0.5px solid rgba(0,0,0,0.07); Shadow: `--shadow-card`
* Active state: 1.5px solid `--color-accent` border, no padding loss (use inner wrapper)

## Identity Badge

* Background: `--gradient`
* Border radius: `--radius-badge`; Padding: 16–18px
* Used on: dashboard body, as standalone card on off-white background

## Buttons

### Primary CTA (conversion actions)

* Background: `--color-accent`
* Border: 2px solid rgba(255,255,255,0.4)
* Border radius: `--radius-pill`
* Text: `--color-surface`, `--font-size-body`, `--font-weight-bold`
* Use: conversion moments only.

### Secondary / Transactional (progress actions)

* Background: rgba(0,0,0,0.06)
* Border: 1px solid rgba(0,0,0,0.10)
* Border radius: `--radius-md`
* Text: `--color-text-primary`, `--font-size-body`, `--font-weight-semibold`
* Use: actions that confirm progress (e.g. Continue, Next, Login, Signup, Submit)

# Spacing & Layout

Use CSS variables from `globals.css`:

* Screen padding: `--spacing-screen-x`
* Card gap: `--spacing-card-gap`
* Section gap: `--spacing-section-gap`
* Border radius: `--radius-sm` · `--radius-md` · `--radius-card` · `--radius-badge` · `--radius-pill`
* Shadows: `--shadow-card` · `--shadow-orb`
