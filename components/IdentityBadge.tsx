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

type IdentityBadgeProps = {
  primarySignatureName?: string; // falls back to IconShield when absent/unrecognized
};

export default function IdentityBadge({ primarySignatureName }: IdentityBadgeProps) {
  const SignatureIcon = SIGNATURE_ICONS[(primarySignatureName ?? '') as SignatureName] ?? IconShield;

  return (
    <div className="identity-badge-wrap">
      <svg width="80" height="88" viewBox="0 0 80 88">
        <defs>
          <linearGradient id="shield-grad" x1="24" y1="4" x2="56" y2="84" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FE5618" />
            <stop offset="50%" stopColor="#C60567" />
            <stop offset="100%" stopColor="#510085" />
          </linearGradient>
        </defs>
        <path d="M40 4 L72 16 L72 48 Q72 72 40 84 Q8 72 8 48 L8 16 Z" fill="url(#shield-grad)" />
      </svg>
      <div className="identity-badge-icon">
        <SignatureIcon size={28} color="rgba(255,255,255,0.95)" stroke={1.5} />
      </div>
    </div>
  );
}
