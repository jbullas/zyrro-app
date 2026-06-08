export const SIGNATURES = [
  // Visioning
  { name: 'Visionary',      domain: 'Visioning',  description: 'sees future states early' },
  { name: 'Architect',      domain: 'Visioning',  description: 'structures complexity' },
  { name: 'Originator',     domain: 'Visioning',  description: 'creates from scratch' },
  { name: 'Alchemist',      domain: 'Visioning',  description: 'finds value in failure' },
  { name: 'Synthesizer',    domain: 'Visioning',  description: 'combines ideas' },
  // Thinking
  { name: 'Pattern Seeker', domain: 'Thinking',   description: 'detects patterns' },
  { name: 'Depth Diver',    domain: 'Thinking',   description: 'goes deep into domains' },
  { name: 'Contextualiser', domain: 'Thinking',   description: 'sees systems and context' },
  { name: 'Contrarian',     domain: 'Thinking',   description: 'challenges assumptions' },
  { name: 'Futurist',       domain: 'Thinking',   description: 'thinks in future trajectories' },
  // Connecting
  { name: 'Catalyst',       domain: 'Connecting', description: 'activates others' },
  { name: 'Resonator',      domain: 'Connecting', description: 'reads emotional states' },
  { name: 'Amplifier',      domain: 'Connecting', description: 'develops others' },
  { name: 'Bridge',         domain: 'Connecting', description: 'connects worlds' },
  { name: 'Illuminator',    domain: 'Connecting', description: 'creates clarity in others' },
  // Driving
  { name: 'Activator',      domain: 'Driving',    description: 'moves to action quickly' },
  { name: 'Pioneer',        domain: 'Driving',    description: 'explores new paths' },
  { name: 'Builder',        domain: 'Driving',    description: 'creates lasting systems' },
  { name: 'Optimizer',      domain: 'Driving',    description: 'improves systems' },
  { name: 'Finisher',       domain: 'Driving',    description: 'completes work' },
  // Sensing
  { name: 'Meaning Maker',  domain: 'Sensing',    description: 'seeks purpose' },
  { name: 'Truth Seeker',   domain: 'Sensing',    description: 'prioritizes truth' },
  { name: 'Empath',         domain: 'Sensing',    description: 'feels others deeply' },
  { name: 'Intuitive',      domain: 'Sensing',    description: 'acts on instinct' },
  { name: 'Guardian',       domain: 'Sensing',    description: 'protects what matters' },
] as const;

export type SignatureName = typeof SIGNATURES[number]['name'];

export const DOMAINS = [
  'Visioning', 'Thinking', 'Connecting', 'Driving', 'Sensing',
] as const;

export type Domain = typeof DOMAINS[number];
