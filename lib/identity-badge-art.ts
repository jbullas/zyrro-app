import {
  IconTelescope, IconBuildingSkyscraper, IconSparkles, IconFlask, IconCirclesRelation,
  IconChartDots, IconArrowBarDown, IconLayersIntersect, IconSwords, IconRocket,
  IconBolt, IconWaveSine, IconSpeakerphone, IconBuildingBridge, IconBulb,
  IconPlayerPlay, IconCompass, IconHammer, IconAdjustments, IconFlag,
  IconAnchor, IconEye, IconHeart, IconHandStop, IconShieldLock,
  IconShield,
} from '@tabler/icons-react';
import { type SignatureName } from '@/lib/signatures';

// #7: the identity badge's static artwork, shared by components/IdentityBadge
// (the page) and app/s/[slug]/opengraph-image (the share preview, drawn by
// Satori), so the two can't drift. Colours are not here: on the page they come
// from globals.css (.identity-badge-wrap stop rules); the image fills in the
// same token values itself.

export const SIGNATURE_ICONS: Record<SignatureName, typeof IconShield> = {
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

/** The signature's icon; IconShield when the name is absent or unrecognised. */
export function signatureIcon(primarySignatureName?: string): typeof IconShield {
  return SIGNATURE_ICONS[(primarySignatureName ?? '') as SignatureName] ?? IconShield;
}

export const BADGE_VIEWBOX = '0 0 80 88';
export const BADGE_SHIELD_PATH = 'M40 4 L72 16 L72 48 Q72 72 40 84 Q8 72 8 48 L8 16 Z';
export const BADGE_GRADIENT = { x1: '24', y1: '4', x2: '56', y2: '84', offsets: ['0%', '50%', '100%'] } as const;
export const BADGE_ICON_COLOR = 'rgba(255,255,255,0.95)';

// #154: size + muted variant. lg is the original 80x88 badge.
export const BADGE_SIZES = {
  lg: { width: 80, height: 88, icon: 28, iconStroke: 1.5, modifier: '' },
  md: { width: 44, height: 48, icon: 20, iconStroke: 1.7, modifier: ' identity-badge-wrap--md' },
  sm: { width: 40, height: 44, icon: 18, iconStroke: 1.7, modifier: ' identity-badge-wrap--sm' },
} as const;

export type BadgeSize = keyof typeof BADGE_SIZES;
