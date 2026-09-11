'use client';

import { useState } from 'react';
import GeneratingState from '@/components/GeneratingState';
import MessageState from '@/components/MessageState';
import PrimaryButton from '@/components/PrimaryButton';
import LinkButton from '@/components/LinkButton';
import SubmitError from '@/components/SubmitError';
import ConstellationCard from '@/components/ConstellationCard';
import type { PathReportState } from '@/lib/use-path-report';
import type { ProjectNamingState } from '@/lib/use-project-naming';

// #134 Slice 3 UI — final "Your Path" report + naming, the terminal step of
// the redesigned /path flow. Mirrors components/OptionsFlow.tsx's
// file-per-flow convention and its generating/failed GeneratingState/
// MessageState composition, but path_report's own phase vocabulary comes
// from lib/use-path-report.ts's plain GenerationPhase (Tier C: idle/
// spinner/come-back-later/ready/failed), not the checkpoint-session union
// OptionsFlow branches on — see use-path-report.ts's own header for why.
//
// Report sections mirror the recovered pre-#134 Stage D report render (git
// commit faedc73) for the fields that still exist in the new
// PathReportContent schema (thesis/what_it_is/why_it_fits/honest_cost/
// life_it_leads_toward/master_strategy) — 'not_this' and
// 'plan_seed_actions' are dropped, they belonged to the old Stage 5/6
// schema and have no equivalent here (see this session's own scoping pass).
//
// Naming is NOT auto-offered on report-ready and NOT offered at Options'
// selection step (both deliberately ruled out this session) — it sits at
// the bottom of the finished report, next to a static "what's next" teaser
// with no real destination yet (/plan still reads the old pre-#134
// path_selections table and is orphaned by this pipeline; /mentor isn't
// finished for this flow either — both out of scope here; /plan's
// reconnection is its own follow-up ticket, not touched this session).
// Naming is the one real, working interaction in that bottom block.
//
// The naming dialog markup is recovered near-verbatim from faedc73's own
// project naming dialog, with one simplification: the old dialog tracked
// selectedName/customName as two separate fields; here a single customName
// covers both (clicking a suggestion just writes its name into the same
// field), since the saved value only ever needs to be "whichever string is
// in the box" either way.

const GENERATING_HEADING = 'Your Path is being finalized.';
const GENERATING_EARLY_COPY = 'This usually takes about a minute.';
const GENERATING_LATE_COPY = 'Still working — this is taking a little longer than usual…';
const COME_BACK_LATER_COPY =
  'Your Path is still being finalized. This is taking longer than expected — you can leave this page and come ' +
  'back in a few minutes. It’ll be here when it’s ready.';
const FAILED_BODY = 'We couldn’t finish your Path report. Please try again.';

const WHAT_IT_IS_EXPLANATION = 'The direction itself, stated plainly.';
const WHY_IT_FITS_EXPLANATION =
  'Two separate things have to be true for a direction to be real: you have to be capable of it, and it has to ' +
  'be something you actually want. This is where both get named, and where they overlap.';
const HONEST_COST_EXPLANATION =
  'Every real direction asks something of you. This names the specific cost, tied to a real friction point, not ' +
  'a vague warning.';
const DESTINATION_EXPLANATION =
  'What actually doing this would look like, concretely, given who you demonstrably are. Not a promise of ' +
  'happiness — just an honest picture.';
const STRATEGY_EXPLANATION =
  'The few things that actually determine whether this path succeeds, in the order they need to happen and why.';

const WHATS_NEXT_COPY =
  'Next, this turns into a Project — a Plan for walking this path, and concrete actions to start moving. Not ' +
  'built yet, but it’s coming.';

type PathReportFlowProps = {
  report: PathReportState;
  naming: ProjectNamingState;
};

export default function PathReportFlow({ report, naming }: PathReportFlowProps) {
  const [customName, setCustomName] = useState('');

  function handleOpenNaming() {
    setCustomName('');
    naming.openAndGenerate();
  }

  async function handleSave(name: string | null) {
    const saved = await naming.save(name);
    if (saved !== undefined) {
      report.setProjectName(saved);
      setCustomName('');
    }
  }

  // ── Generating / failed / not-yet-ready ──────────────────────────────
  if (report.phase.phase === 'failed') {
    return (
      <MessageState
        eyebrow="YOUR PATH"
        heading="Something went wrong."
        body={FAILED_BODY}
        cta={<PrimaryButton onClick={report.retry}>Try again</PrimaryButton>}
      />
    );
  }

  if (report.phase.phase === 'come-back-later') {
    return <GeneratingState spinner={false} description={COME_BACK_LATER_COPY} />;
  }

  if (report.phase.phase !== 'ready' || !report.content) {
    const description =
      report.phase.phase === 'spinner' && report.phase.variant === 'late' ? GENERATING_LATE_COPY : GENERATING_EARLY_COPY;
    return <GeneratingState heading={GENERATING_HEADING} description={description} />;
  }

  // ── Ready: full report ────────────────────────────────────────────────
  // Narrowed via a local const, same convention app/path/page.tsx's own
  // comments already document — TS can't carry the guard above's narrowing
  // of `report.content` through unrelated intervening reads otherwise.
  const content = report.content;
  const {
    thesis, what_it_is, why_it_fits, honest_cost, life_it_leads_toward, master_strategy, project_name,
  } = content;

  return (
    <>
      {naming.open && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <p className="eyebrow">NAME YOUR PROJECT</p>
            <h2>Want to name this?</h2>
            <p>Give this direction a name of its own, or skip — your Path stays exactly as it is either way.</p>

            {naming.loading && <div className="spin spinner" />}

            {!naming.loading && naming.options.length > 0 && (
              <div className="project-name-options">
                {naming.options.map(opt => (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => setCustomName(opt.name)}
                    className={`project-name-card${customName === opt.name ? ' selected' : ''}`}
                  >
                    <div className="project-name-card-title">{opt.name}</div>
                    <p className="project-name-card-rationale">{opt.rationale}</p>
                  </button>
                ))}
              </div>
            )}

            {!naming.loading && (
              <input
                className="input-field"
                type="text"
                placeholder="Or write your own"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            )}

            <SubmitError error={naming.error} />

            <div className="dialog-actions">
              <PrimaryButton
                onClick={() => handleSave(customName.trim() || null)}
                disabled={naming.saving || !customName.trim()}
              >
                {naming.saving ? 'Saving…' : 'Name this Project'}
              </PrimaryButton>
              <LinkButton onClick={() => handleSave(null)} disabled={naming.saving}>
                Skip
              </LinkButton>
            </div>
          </div>
        </div>
      )}

      <div className="flow-container">
        <div className="scroll">

          <div className="section cover">
            <p className="eyebrow">Your Path</p>
            {project_name && <p className="cover-context-line">{project_name}</p>}
            <p className="identity-thesis">{thesis}</p>
          </div>

          <div className="section">
            <p className="eyebrow">WHAT THIS PATH IS</p>
            <p className="documentation">{WHAT_IT_IS_EXPLANATION}</p>
            <div className="card"><p>{what_it_is}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">WHY IT FITS</p>
            <p className="documentation">{WHY_IT_FITS_EXPLANATION}</p>
            <div className="card"><p>{why_it_fits}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">THE HONEST COST</p>
            <p className="documentation">{HONEST_COST_EXPLANATION}</p>
            <div className="card"><p>{honest_cost}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">WHERE THIS LEADS</p>
            <p className="documentation">{DESTINATION_EXPLANATION}</p>
            <div className="card"><p>{life_it_leads_toward}</p></div>
          </div>

          <div className="section">
            <p className="eyebrow">YOUR STRATEGY</p>
            <p className="documentation">{STRATEGY_EXPLANATION}</p>
            {master_strategy.map((objective, i) => (
              <ConstellationCard
                key={objective.name}
                badge={i + 1}
                title={objective.name}
                meta={i === 0 ? 'Start here' : `Step ${i + 1}`}
              >
                <p className="evidence-analysis">{objective.description}</p>
                <div className="tension-block">
                  <span className="tension-label">WHY NOW</span>
                  <p>{objective.sequencing_rationale}</p>
                </div>
              </ConstellationCard>
            ))}
          </div>

          <div className="section">
            <div className="card" style={{ textAlign: 'center' }}>
              <p>{WHATS_NEXT_COPY}</p>
              {project_name ? (
                <>
                  <p>You&rsquo;re calling this <strong>{project_name}</strong>.</p>
                  <LinkButton onClick={handleOpenNaming}>Rename it</LinkButton>
                </>
              ) : (
                <LinkButton onClick={handleOpenNaming}>Name this project</LinkButton>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
