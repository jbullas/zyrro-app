import { useId } from 'react';
import {
  IconTelescope, IconBuildingSkyscraper, IconSparkles, IconFlask, IconCirclesRelation,
  IconChartDots, IconArrowBarDown, IconLayersIntersect, IconSwords, IconRocket,
  IconBolt, IconWaveSine, IconSpeakerphone, IconBuildingBridge, IconBulb,
  IconPlayerPlay, IconCompass, IconHammer, IconAdjustments, IconFlag,
  IconAnchor, IconEye, IconHeart, IconHandStop, IconShieldLock,
  IconShield,
} from '@tabler/icons-react';
import { type SignatureName } from '@/lib/signatures';

const SIGNATURE_ICONS: Record<SignatureName, typeof IconShield> = {
  'Visionary':     IconTelescope,
  'Architect':     IconBuildingSkyscraper,
  'Originator':    IconSparkles,
  'Alchemist':     IconFlask,
  'Synthesizer':   IconCirclesRelation,
  'Pattern Seeker':IconChartDots,
  'Depth Diver':   IconArrowBarDown,
  'Contextualiser':IconLayersIntersect,
  'Contrarian':    IconSwords,
  'Futurist':      IconRocket,
  'Catalyst':      IconBolt,
  'Resonator':     IconWaveSine,
  'Amplifier':     IconSpeakerphone,
  'Bridge':        IconBuildingBridge,
  'Illuminator':   IconBulb,
  'Activator':     IconPlayerPlay,
  'Pioneer':       IconCompass,
  'Builder':       IconHammer,
  'Optimizer':     IconAdjustments,
  'Finisher':      IconFlag,
  'Meaning Maker': IconAnchor,
  'Truth Seeker':  IconEye,
  'Empath':        IconHeart,
  'Intuitive':     IconHandStop,
  'Guardian':      IconShieldLock,
};

// #154: size + muted variant + per-instance gradient id. The /identity report
// renders a badge per signature (up to ~16 on one page), so a fixed SVG id
// would be duplicated; useId keeps each gradient reference unique. Gradient
// stop colours come from --color-grad-1/2/3 via CSS (.identity-badge-wrap
// stop rules in globals.css), not hex in markup.
const SIZES = {
  lg: { width: 80, height: 88, icon: 28, modifier: '' },
  md: { width: 44, height: 48, icon: 20, modifier: ' identity-badge-wrap--md' },
  sm: { width: 40, height: 44, icon: 18, modifier: ' identity-badge-wrap--sm' },
} as const;

type IdentityBadgeProps = {
  primarySignatureName?: string; // falls back to IconShield when absent/unrecognized
  size?: keyof typeof SIZES;      // default 'lg' (the original 80x88 badge)
  muted?: boolean;                // grey shield (secondary signatures)
};

export default function IdentityBadge({ primarySignatureName, size = 'lg', muted = false }: IdentityBadgeProps) {
  const SignatureIcon = SIGNATURE_ICONS[(primarySignatureName ?? '') as SignatureName] ?? IconShield;
  const gradientId = useId();
  const dims = SIZES[size];

  return (
    <div className={`identity-badge-wrap${dims.modifier}${muted ? ' identity-badge-wrap--muted' : ''}`}>
      <svg width={dims.width} height={dims.height} viewBox="0 0 80 88" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="24" y1="4" x2="56" y2="84" gradientUnits="userSpaceOnUse">
            <stop offset="0%" />
            <stop offset="50%" />
            <stop offset="100%" />
          </linearGradient>
        </defs>
        <path d="M40 4 L72 16 L72 48 Q72 72 40 84 Q8 72 8 48 L8 16 Z" fill={`url(#${gradientId})`} />
      </svg>
      <div className="identity-badge-icon">
        <SignatureIcon size={dims.icon} color="rgba(255,255,255,0.95)" stroke={size === 'lg' ? 1.5 : 1.7} />
      </div>
    </div>
  );
}
