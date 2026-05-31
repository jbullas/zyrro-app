# Identity Badge Update Brief

Read these files before writing any code:
- docs/standards/identity-signature-icons.md
- docs/standards/branding-guidelines.md
- docs/standards/identity-signature-report.md
- app/identity/page.tsx

## Overview
Replace the starburst SVG badge on the 
/identity cover with a gradient shield badge 
containing a Tabler icon based on the user's 
#1 primary signature.

## Shield
Container: width 80px, height 88px
SVG viewBox: 0 0 80 88
Shield path: 
M40 4 L72 16 L72 48 Q72 72 40 84 Q8 72 8 48 L8 16 Z
Fill: linear-gradient(160deg, #FE5618, 
#C60567, #510085)

## Icon
Size: 28px
Color: rgba(255,255,255,0.95)
Position: centred inside shield
Read from: report.primary_constellation[0].name

## Icon mapping
See docs/standards/identity-signature-icons.md
for complete mapping of all 25 signatures to 
Tabler icon component names.

Import only the icons that are used.
Default to IconShield if no match found.

## Implementation notes
- Use a JavaScript object to map signature 
  names to icon components
- Render the mapped icon component inside 
  the SVG shield container
- The shield SVG and icon should be wrapped 
  in a div centred on the cover

## Documentation updates
After implementing, update these files:

1. docs/standards/identity-signature-report.md
   Section 0 Cover — badge description:
   Change to: "Gradient shield badge, 80x88px, 
   SVG shield path with brand gradient fill, 
   Tabler icon centred inside based on #1 
   primary signature. See 
   identity-signature-icons.md for mapping."

2. docs/standards/branding-guidelines.md
   Iconography section — identity badge entry:
   Change to: "Identity badge: gradient shield 
   80x88px, brand gradient fill, Tabler icon 
   28px white centred inside, icon determined 
   by user's #1 primary signature."

## Do not change
Any other sections of the page.
Run TypeScript check when done and 
confirm no errors.