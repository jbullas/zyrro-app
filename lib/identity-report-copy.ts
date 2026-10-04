// #154 step 3: every static string on the /identity report, in one place, so
// step 2 (final copy) edits only this file; see #154
// (docs/changelogs/2026-10-04.md). Copy rules (planning
// brief decision 12): no "four paths are ready", no 7-day plan, no mentoring
// claims, sell value and benefits rather than the steps of the Path flow.
// The generating / gated / error screens keep their existing strings in
// app/identity/page.tsx (unchanged by step 3).
import type { SignatureName } from '@/lib/signatures';

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
    body: 'Discover the direction your signatures point to: one that uses your strengths, fits what you want, and avoids what drains you.',
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
    worksBestWith: 'Works best with',
    watchOutFor: 'Watch out for',
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
    body:
      'Turn self-knowledge into a clear direction. Path shows you where your patterns naturally lead and why that ' +
      'direction suits you, so your next move is a choice, not a guess.',
    button: 'Find your path',
    price: 'One-time payment of $49',
  },
  footer: {
    disclaimer:
      'This report is a reflective interpretation of recurring patterns in your answers. It is designed to help you ' +
      'recognise how you naturally think, create and operate, not to place you inside a fixed personality type.',
  },
} as const;

/**
 * #154 step 2: the headline for each signature, shown as the hero card's short
 * definition and the expanded card's headline. Typed against SignatureName so
 * a missing signature fails tsc. Kept apart from lib/signatures.ts on purpose:
 * its descriptions feed the Detection prompt.
 */
export const SIGNATURE_HEADLINES: Record<SignatureName, string> = {
  Visionary: 'Sees the future before it arrives.',
  Architect: 'Gives ideas structure.',
  Originator: 'Creates what doesn’t exist yet.',
  Alchemist: 'Turns setbacks into something of value.',
  Synthesizer: 'Combines ideas into something new.',
  'Pattern Seeker': 'Sees the patterns others miss.',
  'Depth Diver': 'Goes deep until it’s truly understood.',
  Contextualiser: 'Sees the whole picture.',
  Contrarian: 'Tests what everyone else assumes.',
  Futurist: 'Thinks in long trajectories.',
  Catalyst: 'Sets other people in motion.',
  Resonator: 'Reads the emotional room.',
  Amplifier: 'Helps others grow into their potential.',
  Bridge: 'Connects different worlds.',
  Illuminator: 'Brings clarity to complexity.',
  Activator: 'Moves quickly from idea to action.',
  Pioneer: 'Explores new territory and possibility.',
  Builder: 'Builds things that last.',
  Optimizer: 'Makes good systems better.',
  Finisher: 'Sees things through to the end.',
  'Meaning Maker': 'Needs the work to matter.',
  'Truth Seeker': 'Looks beneath appearances for what is true.',
  Empath: 'Feels what others feel.',
  Intuitive: 'Trusts instinct before proof.',
  Guardian: 'Protects what matters most.',
};

/** Headline for a signature name read from a report; empty for an unknown name. */
export function signatureHeadline(name: string): string {
  return (SIGNATURE_HEADLINES as Record<string, string>)[name] ?? '';
}
