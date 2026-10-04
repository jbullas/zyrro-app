// #154 step 3: every static string on the /identity report, in one place, so
// step 2 (final copy) edits only this file. Placeholder wording until then;
// see docs/briefs/154-step3-identity-layout.md "Copy". Copy rules (planning
// brief decision 12): no "four paths are ready", no 7-day plan, no mentoring
// claims, sell value and benefits rather than the steps of the Path flow.
// The generating / gated / error screens keep their existing strings in
// app/identity/page.tsx (unchanged by step 3).
import { SIGNATURES } from '@/lib/signatures';

export const IDENTITY_REPORT_COPY = {
  hero: {
    eyebrow: 'Your Identity at a Glance',
    preparedFor: (name: string) => `Prepared for ${name}`,
  },
  domains: {
    eyebrow: 'Your Domain Profile',
    explanation: 'How strongly each of the five identity domains shows up in your answers, compared with each other.',
  },
  primarySignatures: {
    eyebrow: 'Your Primary Signatures',
  },
  heroCta: {
    heading: 'Your identity points somewhere.',
    body: 'Path turns these signatures into possible directions, shaped by what you want and what you won’t accept.',
    button: 'Find your path',
    price: 'One-time payment of $49',
  },
  depth: {
    eyebrow: 'Your Signatures in Depth',
    scoreExplanation: 'Score out of 25: how often and how strongly each pattern appears in your answers.',
    scoreOutOf: (score: number) => `${score}/25`,
    noScore: '–',
    expand: (name: string) => `Expand ${name}`,
    collapse: (name: string) => `Collapse ${name}`,
  },
  deepDive: {
    whatThisMeans: 'What this means',
    evidence: 'Evidence from your story',
    showsUp: 'How this shows up in your life',
    servesYou: 'Where this serves you',
    worksWith: 'Works with',
    operating: 'How it shapes the way you operate',
    operatingLabels: {
      at_work: 'At work',
      thinking: 'Thinking',
      with_people: 'With people',
      deciding: 'Deciding',
    },
    friction: 'Potential friction',
    underPressure: 'Under pressure',
  },
  pairings: {
    eyebrow: 'How Your Signatures Work Together',
    title: (a: string, b: string) => `${a} + ${b}`,
  },
  distinctivePattern: {
    eyebrow: 'Your Distinctive Pattern',
  },
  energy: {
    eyebrow: 'What Gives You Energy',
  },
  drains: {
    eyebrow: 'What Drains You',
  },
  pathInvitation: {
    body: 'These two lists are where Path starts: you’ll choose what a good direction must have and must avoid.',
    link: 'See how Path works',
  },
  patternToNotice: {
    eyebrow: 'The Pattern to Notice',
  },
  bottomCta: {
    heading: 'Your identity points somewhere. Find your path.',
    body: '[STEP 2 COPY: value and benefits of Path]',
    button: 'Find your path',
    price: 'One-time payment of $49',
  },
  footer: {
    disclaimer:
      'This report is a reflective interpretation of recurring patterns in your answers. It is designed to help you ' +
      'recognise how you naturally think, create and operate, not to place you inside a fixed personality type.',
    brand: 'Zyrro',
    tagline: 'Know Yourself. Create What’s Next.',
  },
} as const;

/**
 * Placeholder signature headline / short definition until step 2 writes the
 * 25 final headlines: the signature's `description` from lib/signatures.ts,
 * sentence-cased with a full stop ("creates clarity in others" →
 * "Creates clarity in others.").
 */
export function signatureHeadline(name: string): string {
  const description = SIGNATURES.find(s => s.name === name)?.description ?? '';
  if (!description) return '';
  return description.charAt(0).toUpperCase() + description.slice(1) + '.';
}
