import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { loadSharedHero } from '@/lib/share-link';

// #7: social preview for /s/[slug]: the Named Identity, the domain profile
// bars (same order and values as the page) and "zyrro.ai". Colours are the
// globals.css tokens. Inter (OFL, assets/fonts) is used here only; the app
// itself keeps its system font stack. Every div sets display: flex, which
// Satori (ImageResponse's renderer) requires for multi-child elements. In
// each bar row the label and value columns don't shrink, and the track has
// flexBasis 0, so its width never depends on its fill: every track starts
// and ends at the same x.

export const alt = 'Zyrro Identity';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TEXT_PRIMARY = '#1E1E1E';   // --color-text-primary
const TEXT_SECONDARY = '#6E6E6E'; // --color-text-secondary
const BG = '#F7F6F3';             // --color-bg
const PINK = '#C60567';           // --color-grad-2 (eyebrow)
const GRADIENT = 'linear-gradient(90deg, #FE5618, #C60567 50%, #510085)'; // --gradient-cta, horizontal

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hero = await loadSharedHero(slug);
  if (!hero) notFound();

  const [regular, extraBold] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/Inter-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/Inter-ExtraBold.ttf')),
  ]);
  const domains = Object.entries(hero.domain_profile).sort((a, b) => b[1] - a[1]);

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', flexDirection: 'column', background: BG, fontFamily: 'Inter' }}>
        <div style={{ display: 'flex', height: 12, width: '100%', backgroundImage: GRADIENT }} />
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '52px 80px 48px' }}>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 800, letterSpacing: 3, color: PINK, textTransform: 'uppercase' }}>
            Identity Signature
          </div>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, lineHeight: 1.08, color: TEXT_PRIMARY, marginTop: 12 }}>
            {hero.named_identity}
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
        </div>
        <div style={{ display: 'flex', position: 'absolute', right: 80, bottom: 40, fontSize: 26, fontWeight: 400, color: TEXT_SECONDARY }}>
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
