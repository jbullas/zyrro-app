# Identity Signature Icons

Canonical signature names and meanings:
see `docs/framework/zyrro_detection_engine_spec_v_1.md`.

Each of the 25 Identity Signatures maps to a 
Tabler icon displayed inside the gradient shield 
badge on the /identity cover.

The badge reads the user's #1 primary signature 
(report.primary_constellation[0].name) and 
renders the corresponding icon.

Note: Icons to be upgraded to premium custom 
illustrations in a future design pass.

## Mapping

### Visioning
- Visionary — IconTelescope
- Architect — IconBuildingSkyscraper
- Originator — IconSparkles
- Alchemist — IconFlask
- Synthesizer — IconCirclesRelation

### Thinking
- Pattern Seeker — IconChartDots
- Depth Diver — IconArrowBarDown
- Contextualiser — IconLayersIntersect
- Contrarian — IconSwords
- Futurist — IconRocket

### Connecting
- Catalyst — IconBolt
- Resonator — IconWaveSine
- Amplifier — IconSpeakerphone
- Bridge — IconBuildingBridge
- Illuminator — IconBulb

### Driving
- Activator — IconPlayerPlay
- Pioneer — IconCompass
- Builder — IconHammer
- Optimizer — IconAdjustments
- Finisher — IconFlag

### Sensing
- Meaning Maker — IconAnchor
- Truth Seeker — IconEye
- Empath — IconHeart
- Intuitive — IconHandStop
- Guardian — IconShieldLock

## Default
IconShield — shown if no signature match found.

## Shield spec
Shape: SVG path 
"M40 4 L72 16 L72 48 Q72 72 40 84 Q8 72 8 48 L8 16 Z"
viewBox: 0 0 80 88, width 80, height 88
Fill: use `--gradient` from `globals.css`
Icon: 28px, color rgba(255,255,255,0.95), centred

The SVG path mirrors the badge component — see the
badge component for the authoritative path geometry.