import GeneratingState from '@/components/GeneratingState';
import MessageState from '@/components/MessageState';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';
import LinkButton from '@/components/LinkButton';
import SubmitError from '@/components/SubmitError';
import { useState } from 'react';
import type { PathOptionsState } from '@/lib/use-path-options';

// #134 Slice 2 — Checkpoint 2 "Options" content, mirroring
// components/DirectionFlow.tsx's file-per-flow convention (PathPage owns
// the loading/error early returns and passes down an already-narrowed
// `options` prop, this component owns every content branch). Two recovered
// pieces of git history inform this file directly (see the session's own
// investigation before writing any of this):
//
// - The generating-state spinner copy (heading/early/late/come-back-later/
//   failed) is adapted from the Stage D /path UX (commit faedc73, removed
//   in #134 Slice 1's dead-code cleanup) — same GeneratingState/MessageState
//   composition, same useCheckpointSessionStatus phase union driving it,
//   copy reworded from "Your Path is being prepared" to be Options-specific.
//   Unlike that old UI, the failed-state retry CTA here actually calls
//   options.retry() — Slice 2's own app/api/path-options/route.ts GET
//   handler now resumes a failed session (claimGeneration + re-run), so
//   this isn't a dead end the way a naive copy of the old markup would be.
// - The per-card layout is adapted from the actual pre-#129 path_options
//   4-card UI (commit 7be3ba2), not the Stage D version's single-shared-
//   button "project-name-card" pattern — that Stage D pattern is exactly
//   what brief §4 calls out as wrong (one button below a stack of prose,
//   not a real per-card action). .constellation-card/.option-card-footer
//   are reused verbatim from that recovered pre-#129 markup. .option-card-sigs
//   (the recovered pattern's signature-chip row) is NOT reused — CP2's
//   candidates have no signatures_engaged field the way the old
//   path_options schema did (§4's content bar is deliberately simpler),
//   so there's no real data to put there; rendering an empty or fabricated
//   chip row would be worse than omitting it.
//
// The RedoField free-text pattern (same commit) is reused near-verbatim for
// the refine section below ("Not quite right?" copy, textarea + LinkButton),
// since Checkpoint 2's "provide free-text alternative input" is the direct
// analogue of the old flow's redo.

const OPTIONS_INTRO =
  'Four directions, built from what you just told us matters. Pick the one that’s closest to right — or tell us ' +
  'what’s still missing and we’ll generate two more.';

const OPTIONS_EXPLANATION =
  'Each option is a genuinely different direction, grounded in your must-haves, your must-avoids, and what you said ' +
  'an ideal life looks like. Pick one to move forward, or steer us toward something closer below.';

const COMMENTS_EXPLANATION =
  'Anything else you want us to know before we build this out? Optional.';

const REFINE_EXPLANATION =
  'Tell us what’s missing or off, and we’ll generate two more directions alongside these.';

const OPTIONS_SAVED_EXPLANATION = 'Your path is set — here’s what you chose.';

const GENERATING_HEADING = 'Your options are being generated.';
const GENERATING_EARLY_COPY = 'This usually takes about a minute.';
const GENERATING_LATE_COPY = 'Still working — this is taking a little longer than usual…';
const COME_BACK_LATER_COPY =
  'Your options are still being generated. This is taking longer than expected — you can leave this page and come ' +
  'back in a few minutes. It’ll be here when it’s ready.';
const FAILED_BODY = 'We couldn’t generate your options. Please try again.';

type OptionsFlowProps = {
  options: PathOptionsState & {
    status: NonNullable<PathOptionsState['status']>;
    content: NonNullable<PathOptionsState['content']>;
  };
};

export default function OptionsFlow({ options }: OptionsFlowProps) {
  const [tentativeId, setTentativeId] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [refineText, setRefineText] = useState('');

  const optionsCover = (
    <div className="section cover">
      <p className="eyebrow">Your Path</p>
      <h1>Options</h1>
      <p className="identity-thesis">{OPTIONS_INTRO}</p>
    </div>
  );

  // ── Generating: initial batch, or a refine round in flight ──────────
  if (options.status === 'generating') {
    const phase = options.phase;

    if (phase.phase === 'failed') {
      return (
        <MessageState
          eyebrow="YOUR PATH"
          heading="Something went wrong."
          body={FAILED_BODY}
          cta={<PrimaryButton onClick={options.retry}>Try again</PrimaryButton>}
        />
      );
    }

    if (phase.phase === 'come-back-later') {
      return <GeneratingState spinner={false} description={COME_BACK_LATER_COPY} />;
    }

    const description =
      phase.phase === 'spinner' && phase.variant === 'late' ? GENERATING_LATE_COPY : GENERATING_EARLY_COPY;

    return <GeneratingState heading={GENERATING_HEADING} description={description} />;
  }

  // ── Complete: terminal summary ───────────────────────────────────────
  if (options.status === 'complete') {
    const chosen = options.content.candidates.find(c => c.id === options.content.selected_candidate_id);

    return (
      <div className="flow-container">
        <div className="scroll">
          {optionsCover}
          <div className="section">
            <p className="eyebrow">CHECKPOINT 2 · OPTIONS</p>
            <p className="documentation">{OPTIONS_SAVED_EXPLANATION}</p>
            {chosen && (
              <div className="card">
                <p className="card-sub-label">YOUR CHOSEN DIRECTION</p>
                <p className="constellation-sig-name">{chosen.name}</p>
                <p>{chosen.description}</p>
              </div>
            )}
            {options.content.comments && (
              <div className="card">
                <p className="card-sub-label">YOUR COMMENTS</p>
                <p>{options.content.comments}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Awaiting checkpoint: the 4/6/8-card decision ─────────────────────
  const { candidates } = options.content;
  const atCap = candidates.length >= 8;

  async function handleConfirm() {
    if (!tentativeId) return;
    await options.submitSelect(tentativeId, comments);
  }

  async function handleRefine() {
    if (!refineText.trim()) return;
    const text = refineText;
    setRefineText('');
    await options.submitRefine(text);
  }

  return (
    <div className="flow-container">
      <div className="scroll">
        {optionsCover}
        <div className="section">
          <p className="eyebrow">CHECKPOINT 2 · OPTIONS</p>
          <p className="documentation">{OPTIONS_EXPLANATION}</p>

          {candidates.map(c => (
            <div key={c.id} className={`constellation-card${tentativeId === c.id ? ' selected' : ''}`}>
              <div className="constellation-card-header">
                <div className="constellation-header-info">
                  <div className="constellation-sig-name">{c.name}</div>
                </div>
              </div>
              <p className="evidence-analysis">{c.description}</p>
              <div className="option-card-footer">
                <SecondaryButton onClick={() => setTentativeId(c.id)} disabled={options.submitting}>
                  {tentativeId === c.id ? 'Selected ✓' : 'Select This Path →'}
                </SecondaryButton>
              </div>
            </div>
          ))}

          {tentativeId && (
            <div className="card">
              <p className="card-sub-label">ANYTHING ELSE?</p>
              <p className="documentation">{COMMENTS_EXPLANATION}</p>
              <textarea
                className="input-field input-field--textarea"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Any additional comments, wishes, or requests before we build this out."
                disabled={options.submitting}
              />
              <SubmitError error={options.submitError} />
              <div className="option-card-footer">
                <LinkButton onClick={() => setTentativeId(null)} disabled={options.submitting}>
                  Change selection
                </LinkButton>
                <SecondaryButton onClick={handleConfirm} disabled={options.submitting}>
                  {options.submitting ? 'Confirming…' : 'Confirm selection →'}
                </SecondaryButton>
              </div>
            </div>
          )}

          {!atCap && (
            <div className="card">
              <p className="card-sub-label">Not quite right?</p>
              <p className="documentation">{REFINE_EXPLANATION}</p>
              <textarea
                className="input-field input-field--textarea"
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder="Tell us what’s missing or off, and we’ll take another pass."
                disabled={options.submitting}
              />
              <SubmitError error={options.submitError} />
              <div className="option-card-footer">
                <LinkButton onClick={handleRefine} disabled={options.submitting || !refineText.trim()}>
                  {options.submitting ? 'Generating…' : 'Generate 2 more options'}
                </LinkButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
