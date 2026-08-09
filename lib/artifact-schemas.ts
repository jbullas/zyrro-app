export type SignalType =
  | "Energy Peaks"
  | "Frustration Patterns"
  | "Recurring Themes"
  | "Pride Moments";

export type EmotionalWeight = "low" | "medium" | "high";

export type ScoreBand = "weak" | "moderate" | "strong" | "dominant";

export type ConfidenceLevel = "low" | "medium" | "high";

export type DomainName =
  | "Visioning"
  | "Thinking"
  | "Connecting"
  | "Driving"
  | "Sensing";

export interface EvidenceUnit {
  quote_or_paraphrase: string;
  source_question: number; // 1-13
  signal_types: SignalType[];
  emotional_weight: EmotionalWeight;
  primary_signature_candidate: string;
  secondary_signature_candidate?: string;
}

export interface SignatureScore {
  name: string;
  domain: DomainName;
  definition: string;
  evidence_count: number;
  supporting_evidence_indexes: number[];
  frequency: number; // 1-5
  intensity: number; // 1-5
  score: number; // frequency * intensity
  score_band: ScoreBand;
  confidence: ConfidenceLevel;
}

export interface ConflictResolution {
  pair_or_group: string;
  decision: string;
  reason: string;
}

export interface DomainProfile {
  Visioning: number;
  Thinking: number;
  Connecting: number;
  Driving: number;
  Sensing: number;
}

export interface SignatureAnalysisArtifactContent {
  artifact_type: "signature_analysis";
  schema_version: "1.0";
  evidence_units: EvidenceUnit[];
  signatures: SignatureScore[];
  primary_constellation: string[]; // top 5
  secondary_signatures: string[]; // up to 3
  emerging_signatures: string[];
  suppressed_signatures: string[];
  named_identity: string;
  identity_rationale: string;
  domain_profile: DomainProfile;
  conflict_resolutions: ConflictResolution[];
  system_checks: {
    used_only_valid_signal_types: boolean;
    ignored_job_titles_as_primary_signal: boolean;
    ignored_aspiration_without_evidence: boolean;
    minimum_two_evidence_units_for_strong_signatures: boolean;
    prioritized_cross_answer_consistency: boolean;
  };
}

export interface CoreIdentitySnapshotArtifactContent {
  artifact_type: "core_identity_snapshot";
  schema_version: "1.0";
  identity_label: string; // e.g. "Pattern Seeker / Meaning Maker"
  source_signatures: [string, string];
  supporting_domains: DomainName[];
  summary_lines: [string, string, string?];
  tension_hint: string;
  confidence: ConfidenceLevel;
  based_on_named_identity?: string;
}

// Layer 2 — Identity Signature Report

export interface ReportCover {
  report_title: "ZYRRO IDENTITY REPORT";
  prepared_for: string;
  named_identity: string;       // "THE [Identity Name]"
  identity_context: string;     // "[role] · [industry] · [phase]"
  report_metadata: string;      // "Discovery Report · Version 1.0 · [year]"
  identity_thesis: string;      // 8-18 words
}

export interface SignatureProfileEntry {
  name: string;
  score: number; // 1-25
}

export interface SignatureProfileSummary {
  primary_signatures: SignatureProfileEntry[];   // exactly 5
  secondary_signatures: SignatureProfileEntry[]; // exactly 3
}

export interface PrimarySignatureAnalysis {
  signature_number: string;   // "01"–"05"
  name: string;
  domain: DomainName;
  score: number;              // 1-25
  core_statement: string;     // 8-20 words
  evidence_analysis: string;  // 150-250 words, Pattern→Evidence→Meaning
  tension: string;            // one sentence
}

export interface SecondarySignatureAnalysis {
  signature_number: string;   // "06"–"08"
  name: string;
  domain: DomainName;
  score: number;              // 1-25
  core_statement: string;     // 8-20 words
  analysis: string;           // no floor, ceiling ~100-120 words; compressed, comparative format
}

export interface ConstellationSynthesis {
  named_identity: string;  // "THE [Identity Name]"
  synthesis: string;       // 200-350 words
}

export interface HowYouOperate {
  work_style: string;         // 80-150 words
  thinking_style: string;     // 80-150 words
  relationship_style: string; // 80-150 words
  decision_style: string;     // 80-150 words
  stress_pattern: string;     // 80-150 words
}

export interface ReframeTeaser {
  recap: string;         // ~50-60 words
  reframe: string;       // ~15-30 words, shareable pull-quote
  why_bullets: string[]; // exactly 3
}

export interface IdentitySignatureReportArtifactContent {
  artifact_type: "identity_signature_report";
  schema_version: "1.0" | "1.1" | "1.2" | "1.3";
  cover: ReportCover;
  what_this_report_is: string;                                // 80-140 words
  signature_profile_summary: SignatureProfileSummary;
  primary_constellation: PrimarySignatureAnalysis[];          // exactly 5
  secondary_signature_summary: string;                        // always present, even when secondary_signature_analysis is empty
  secondary_signature_analysis: SecondarySignatureAnalysis[]; // 0-3, matches Detection Engine's secondary_signatures — no forced count
  constellation_synthesis: ConstellationSynthesis;
  how_you_operate: HowYouOperate;
  energisers: string[];      // 6-10 items
  friction_points: string[]; // 6-10 items
  domain_profile: DomainProfile;
  // #103: Layer 2's own prose summary of domain_profile. Optional —
  // undefined on every report generated before this shipped (no backfill,
  // same non-determinism precedent as #62's raw_signature_analysis).
  domain_profile_summary?: string;
  // #113: free-tier /identity teaser, generated alongside the rest of Layer
  // 2 (replaces the separate identity_reframe call that used to fire from
  // /identity). Optional — undefined on every report generated before this
  // shipped, same no-backfill precedent as domain_profile_summary above.
  reframe_teaser?: ReframeTeaser;
  derived_from_signature_analysis: boolean;
  // #62: Layer 1's full Detection Engine output, persisted going-forward only
  // (existing reports predate this field and won't have it — no backfill,
  // since Layer 1 is non-deterministic even at temperature 0, see #93).
  raw_signature_analysis?: {
    signatures: SignatureScore[];
    primary_constellation: string[];   // names only, Layer 1's list
    secondary_signatures: string[];
    emerging_signatures: string[];
    suppressed_signatures: string[];
  };
}

// Identity Reframe (artifact type: "identity_reframe")
//
// #98: the free-tier pitch content, previously generated inside
// path_options. Deliberately just these four fields — the this/therefore
// hook and any renamed sections are #99's concern.
export interface IdentityReframeArtifactContent {
  recap: string;
  meaning: string;
  reframe: string;
  why: string;
}

// Path Options (artifact type: "path_options")

export type StretchType = 'Natural' | 'Adjacent' | 'Reinvention';

export interface PathOption {
  id: string;                  // e.g. "path_01"
  name: string;
  thesis: string;
  body: string;
  signatures_engaged: string[];
  stretch: StretchType;
}

export interface PathOptionsArtifactContent {
  options: PathOption[];       // exactly 4
}

// Path Plan (artifact type: "path_plan")

export interface PathPlanPhase {
  phase_number: number;
  name: string;
  outcome: string;
  estimated_duration: string;
  milestones: string[];
  signatures_leaned_on: string[];
  body: string;
}

export interface StartHereAction {
  action: string;
  why: string;
}

export interface PathPlanArtifactContent {
  plan_frame: string;
  full_path: PathPlanPhase[];      // 3-5 phases
  start_here: StartHereAction[];   // 5-7 actions
  implement_bridge: string;
}
