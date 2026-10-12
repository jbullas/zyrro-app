import { useId } from 'react';
import {
  signatureIcon, BADGE_VIEWBOX, BADGE_SHIELD_PATH, BADGE_GRADIENT, BADGE_ICON_COLOR, BADGE_SIZES, type BadgeSize,
} from '@/lib/identity-badge-art';

// #154: size + muted variant + per-instance gradient id. The /identity report
// renders a badge per signature (up to ~16 on one page), so a fixed SVG id
// would be duplicated; useId keeps each gradient reference unique. Gradient
// stop colours come from --color-grad-1/2/3 via CSS (.identity-badge-wrap
// stop rules in globals.css), not hex in markup. #7: the static artwork
// (shield, gradient, sizes, icons) lives in lib/identity-badge-art.ts, shared
// with the share preview image.

type IdentityBadgeProps = {
  primarySignatureName?: string; // falls back to IconShield when absent/unrecognized
  size?: BadgeSize;               // default 'lg' (the original 80x88 badge)
  muted?: boolean;                // grey shield (secondary signatures)
};

export default function IdentityBadge({ primarySignatureName, size = 'lg', muted = false }: IdentityBadgeProps) {
  const SignatureIcon = signatureIcon(primarySignatureName);
  const gradientId = useId();
  const dims = BADGE_SIZES[size];

  return (
    <div className={`identity-badge-wrap${dims.modifier}${muted ? ' identity-badge-wrap--muted' : ''}`}>
      <svg width={dims.width} height={dims.height} viewBox={BADGE_VIEWBOX} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1={BADGE_GRADIENT.x1} y1={BADGE_GRADIENT.y1} x2={BADGE_GRADIENT.x2} y2={BADGE_GRADIENT.y2} gradientUnits="userSpaceOnUse">
            {BADGE_GRADIENT.offsets.map(offset => <stop key={offset} offset={offset} />)}
          </linearGradient>
        </defs>
        <path d={BADGE_SHIELD_PATH} fill={`url(#${gradientId})`} />
      </svg>
      <div className="identity-badge-icon">
        <SignatureIcon size={dims.icon} color={BADGE_ICON_COLOR} stroke={dims.iconStroke} />
      </div>
    </div>
  );
}
