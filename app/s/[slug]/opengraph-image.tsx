import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import opentype from 'opentype.js';
import {
  signatureIcon, BADGE_VIEWBOX, BADGE_SHIELD_PATH, BADGE_GRADIENT, BADGE_ICON_COLOR, BADGE_SIZES,
} from '@/lib/identity-badge-art';
import { fitTitle } from '@/lib/og-title';
import { loadSharedHero } from '@/lib/share-link';

// #7: social preview for /s/[slug]: the Named Identity (one line), the domain
// profile bars (same order and values as the page), the primary signatures as
// small badge + name cards (same order as the page's cards) and "zyrro.ai".
// Colours are the globals.css tokens. Inter (OFL, assets/fonts) is used here
// only; the app itself keeps its system font stack. Every div sets display:
// flex, which Satori (ImageResponse's renderer) requires for multi-child
// elements. In each bar row the label and value columns don't shrink, and the
// track has flexBasis 0, so its width never depends on its fill: every track
// starts and ends at the same x.

export const alt = 'Zyrro Identity';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TEXT_PRIMARY = '#1E1E1E';   // --color-text-primary
const TEXT_SECONDARY = '#6E6E6E'; // --color-text-secondary
const BG = '#F7F6F3';             // --color-bg
const PINK = '#C60567';           // --color-grad-2 (eyebrow)
const GRADIENT = 'linear-gradient(90deg, #FE5618, #C60567 50%, #510085)'; // --gradient-cta, horizontal

// Title: one line (lib/og-title.ts). "zyrro.ai" sits on the eyebrow's line, not
// the title's, so the title gets the full content width (x 80-1120), less a
// little slack for Satori's own rounding.
const TITLE_MAX_WIDTH = 1040 - 8;

// Badge: drawn with Satori's own SVG support from the same artwork the page's
// IdentityBadge uses (lib/identity-badge-art.ts), at its md size (the page's
// hero cards). On the page, these globals.css rules supply the colours and
// the icon placement; this mirrors them, so if they change, update this too:
//   .identity-badge-wrap stop:nth-of-type(1|2|3) { stop-color: var(--color-grad-1|2|3) }
//   .identity-badge-icon { position: absolute; inset: 0; display: flex;
//                          align-items: center; justify-content: center; }
//   .identity-badge-wrap--md { width: 44px; height: 48px; }
const BADGE_STOPS = ['#FE5618', '#C60567', '#510085']; // --color-grad-1, -2, -3

function badge(name: string, key: number) {
  const dims = BADGE_SIZES.md;
  const Icon = signatureIcon(name);
  // The Tabler icon component's own render (a forwardRef with no hooks): the
  // same <svg>/<path> elements the page renders, as plain elements for Satori.
  const icon = (Icon as unknown as { render: (props: object, ref: null) => ReactElement })
    .render({ size: dims.icon, color: BADGE_ICON_COLOR, stroke: dims.iconStroke }, null);
  const gradientId = `og-badge-${key}`;
  return (
    <div style={{ display: 'flex', position: 'relative', width: dims.width, height: dims.height }}>
      <svg width={dims.width} height={dims.height} viewBox={BADGE_VIEWBOX} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1={BADGE_GRADIENT.x1} y1={BADGE_GRADIENT.y1} x2={BADGE_GRADIENT.x2} y2={BADGE_GRADIENT.y2} gradientUnits="userSpaceOnUse">
            {BADGE_GRADIENT.offsets.map((offset, i) => <stop key={offset} offset={offset} stopColor={BADGE_STOPS[i]} />)}
          </linearGradient>
        </defs>
        <path d={BADGE_SHIELD_PATH} fill={`url(#${gradientId})`} />
      </svg>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: dims.width, height: dims.height, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hero = await loadSharedHero(slug);
  if (!hero) notFound();

  const [regular, extraBold] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/Inter-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/Inter-ExtraBold.ttf')),
  ]);
  const titleFont = opentype.parse(extraBold.buffer.slice(extraBold.byteOffset, extraBold.byteOffset + extraBold.byteLength));
  const title = fitTitle(titleFont, hero.named_identity, TITLE_MAX_WIDTH);
  const domains = Object.entries(hero.domain_profile).sort((a, b) => b[1] - a[1]);

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', flexDirection: 'column', background: BG, fontFamily: 'Inter' }}>
        <div style={{ display: 'flex', height: 12, width: '100%', backgroundImage: GRADIENT }} />
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '52px 80px 48px' }}>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 800, letterSpacing: 3, color: PINK, textTransform: 'uppercase' }}>
            Identity Signature
          </div>
          <div style={{ display: 'flex', fontSize: title.fontSize, fontWeight: 800, lineHeight: 1.08, whiteSpace: 'nowrap', color: TEXT_PRIMARY, marginTop: 12 }}>
            {title.text}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
            {domains.map(([domain, value]) => (
              <div key={domain} style={{ display: 'flex', alignItems: 'center', height: 30, marginBottom: 18 }}>
                <div style={{ display: 'flex', width: 210, flexShrink: 0, fontSize: 26, fontWeight: 800, color: TEXT_PRIMARY }}>{domain}</div>
                <div style={{ display: 'flex', flexGrow: 1, flexBasis: 0, height: 14, borderRadius: 999, background: 'rgba(0,0,0,0.07)' }}>
                  <div style={{ display: 'flex', width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', borderRadius: 999, backgroundImage: GRADIENT }} />
                </div>
                <div style={{ display: 'flex', width: 70, flexShrink: 0, justifyContent: 'flex-end', fontSize: 26, fontWeight: 800, color: TEXT_PRIMARY }}>{value}</div>
              </div>
            ))}
          </div>
          {/* Primary signatures, same order as the page's cards: badge above
              name, in white cards like .sig-card (.card: white, 0.5px
              rgba(0,0,0,0.07) border, 14px radius, soft shadow). The last bar
              row's own 18px margin + 26px here keeps 44px between the blocks. */}
          <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
            {hero.primary.map((sig, i) => (
              <div key={sig.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexGrow: 1, flexBasis: 0, padding: '14px 10px', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                {badge(sig.name, i)}
                <div style={{ display: 'flex', marginTop: 8, fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap', color: TEXT_PRIMARY }}>
                  {sig.name}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Top-right, level with the eyebrow (not on the title's line). */}
        <div style={{ display: 'flex', position: 'absolute', right: 80, top: 59, fontSize: 26, fontWeight: 400, color: TEXT_SECONDARY }}>
          zyrro.ai
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: extraBold, weight: 800, style: 'normal' },
      ],
    }
  );
}
