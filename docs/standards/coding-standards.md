# Zyrro Coding Standards

## Before writing any code
Always read docs/standards/branding-guidelines.md 
before writing any code, creating any component, 
or modifying any styles.

## Styling
- globals.css is the single source of truth 
  for all styles
- Never use inline styles for any property 
  that appears more than once in the codebase
- Never declare a class on a standard HTML 
  element (p, h1, h2, h3, ul, li) unless it 
  needs to differ from the global default
- All new components must use existing global 
  classes before creating new ones
- If a new class is needed, add it to 
  globals.css, not inline

## Typography
Follow the type scale defined in 
docs/standards/branding-guidelines.md exactly.
Do not hardcode font sizes inline.

## Font weights
- 400: body text, descriptions
- 500: secondary labels
- 600: card subtitles, nav labels
- 700: headings, named identity, CTAs, scores

## Buttons
- Primary CTA: .btn-primary only
- Progress actions: .btn-secondary only
- Text actions: .btn-link only
- Never style buttons inline

## Colours
- Never hardcode colour values inline
- Always use the CSS classes or variables 
  defined in globals.css
- Brand gradient exact spec:
  linear-gradient(160deg, #FE5618 0%, #FE5618 12%, 
  #C60567 28%, #510085 52%, #510085 100%)

## Components
- Reusable UI patterns must be React components
- Never duplicate markup across pages

## Bottom Navigation
- 5 fixed tabs always: Home, Identity, Paths, 
  Plan, Chat
- Always visible, always tappable, no locking
- All tabs full colour #1E1E1E at all times
- Active tab shows gradient indicator bar only
- Hide nav on homepage (/) only

## Page layout
- All pages use the same max-width container 
  as the homepage
- Content and bottom nav must be the same width
- Screen padding: 16-18px horizontal

## URLs
- /start — questionnaire
- /identity — identity report
- /paths — path options
- /plan — action plan
- /chat — mentor chat
- /dashboard — logged-in home

## Gated pages
- Non-registered users see a simple gated state 
  on all app pages
- Gated state: eyebrow, heading, body line, 
  two equal secondary buttons (Log in / Start 
  the questionnaire)
- The page handles gating, not the nav