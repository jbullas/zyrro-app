import GeneratingState from '@/components/GeneratingState';
import MessageState from '@/components/MessageState';
import PrimaryButton from '@/components/PrimaryButton';
import LinkButton from '@/components/LinkButton';
import SubmitError from '@/components/SubmitError';
import ConstellationCard from '@/components/ConstellationCard';
import ChipRow from '@/components/ChipRow';
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
//   not a real per-card action). .option-card-footer is reused verbatim
//   from that recovered pre-#129 markup.
//
// #138 §6 switched the per-card markup from hand-rolled constellation-card
// divs (which never actually got a number badge, and whose
// .constellation-sig-name name class was never defined in globals.css —
// both silent pre-existing gaps, not something this change introduces) to
// the real ConstellationCard component, matching /identity's signature
// cards. .option-card-sigs/.chip-tag (via ChipRow) are recovered from the
// same pre-#129 commit but were left unused until now — CP2's candidates
// had no signatures_engaged field until §6 gave them one; rendering an
// empty/fabricated chip row before now would have been worse than omitting
// it, per this file's own original reasoning.
//
// The RedoField free-text pattern (same commit) is reused near-verbatim for
// the refine section below (textarea + LinkButton), since Checkpoint 2's
// "provide free-text alternative input" is the direct analogue of the old
// flow's redo.
//
// #138 §3 shipped three UI fixes, all scoped to this file alone:
// - Renamed the refine trigger from "Not quite right?" to "Want a different
//   option?" — the old copy implied the AI got it wrong; the new one
//   matches what the button underneath it actually does ("Generate 2 more
//   options").
// - The refine card now hides once a candidate is tentatively selected
//   (`!tentativeId` added to its guard) — there's no reason to offer
//   "generate 2 more options" once the user has already picked one, and it
//   used to stay visible alongside "Confirm selection," which read as
//   confusing.
// - The comments field's "reads as inert" complaint: traced the actual data
//   flow first (comments ARE saved correctly and already threaded into
//   #139's report generation, lib/generate-path-report.ts) rather than
//   assuming it was broken. The fix is a single inline acknowledgment line
//   (COMMENTS_ACKNOWLEDGMENT, exported below) — not a broader before/after
//   copy redesign, which is deferred to #139 once that report's actual use
//   of comments is built and can be verified for real, rather than guessed
//   at here. Its rendering below, inside this component's own 'complete'
//   branch, is DEAD CODE — app/path/page.tsx never renders <OptionsFlow>
//   once options.status is 'complete' (see that file's own comment at the
//   equivalent point). Live verification confirmed this: the real reachable
//   moment is app/path/page.tsx's report.loading interstitial instead, which
//   is why the constant is exported — imported and rendered there, not here.
//   Left rendering here too (harmless, unreachable) rather than deleted,
//   same "flag, don't necessarily delete yet" posture this exact dead
//   branch already had before #138 touched this file.
//
// #143 — select/confirm UX fix, confirmed via live testing to read as
// broken: the comment textarea + Confirm/Change-selection controls used to
// render in a separate card below all four candidates, disconnected from
// which one was actually selected (Confirm visually nested inside the
// "ANYTHING ELSE?" box, reading as if commenting were required to
// proceed). Renamed `tentativeId` → `activeId` throughout (name change
// only, same semantics `!tentativeId` had in #138 §3's note above) and:
// - Replaced the SecondaryButton select control with a checkbox-style
//   toggle (.option-select-toggle) — checking selects, unchecking
//   deselects, no separate "Change selection" control anymore. Styled with
//   the existing .btn-link brand color (var(--color-grad-2)) via
//   accent-color, not a new token.
// - Comment textarea + Confirm now render inline inside the selected
//   candidate's own ConstellationCard, not a separate card at the bottom.
// - `comments` (single shared string) replaced with `commentsByCandidate`,
//   a `Record<string, string>` keyed by candidate id and owned here at the
//   parent level — deliberately, so comment text survives regardless of
//   what happens to individual card markup in a future restructuring, per
//   the brief's own reasoning. Switching candidates shows each one's own
//   entry; nothing leaks across candidates.
// - Confirm selection is now a PrimaryButton, not SecondaryButton — a
//   deliberate exception to this flow's otherwise-consistent
//   Secondary-for-progression pattern (Direction's three Continue buttons
//   stay Secondary). Reasoning: Confirm is the only action in /path that
//   triggers actual report generation (a real LLM call and cost), not just
//   navigation to the next screen. Recorded in
//   docs/standards/branding-guidelines.md's Buttons section too, so a
//   future #137 button-consistency pass doesn't "correct" this back.

const OPTIONS_INTRO =
  'Four directions, built from what you just told us matters. Pick the one that’s closest to right — or tell us ' +
  'what’s still missing and we’ll generate two more.';

const OPTIONS_EXPLANATION =
  'Each option is a genuinely different direction, grounded in your must-haves, your must-avoids, and what you said ' +
  'an ideal life looks like. Pick one to move forward, or steer us toward something closer below.';

const COMMENTS_EXPLANATION =
  'Anything else you want us to know before we build this out? Optional.';

// #138 §3: exported — the real, reachable render of this text is in
// app/path/page.tsx's report.loading interstitial, not in this file's own
// 'complete' branch below (see that branch's own comment for why).
export const COMMENTS_ACKNOWLEDGMENT = 'Got it — this will be factored into your final report.';

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [commentsByCandidate, setCommentsByCandidate] = useState<Record<string, string>>({});
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
                <p className="documentation">{COMMENTS_ACKNOWLEDGMENT}</p>
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

  async function handleConfirm(candidateId: string) {
    await options.submitSelect(candidateId, commentsByCandidate[candidateId] ?? '');
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

          {candidates.map((c, i) => {
            const isActive = activeId === c.id;
            return (
              <ConstellationCard key={c.id} badge={i + 1} title={c.name}>
                <p className="core-statement">{c.core_statement}</p>
                <p className="evidence-analysis">{c.description}</p>
                <p className="evidence-analysis"><strong>Select this if:</strong> {c.select_if}</p>
                <div className="tension-block">
                  <span className="tension-label">TENSION</span>
                  <p>{c.tension}</p>
                </div>
                <div className="stat-row fit-stat-row">
                  <div className="score-chip">
                    <span className="score-chip-label">Overall fit</span>
                    <span className="score-chip-value">{c.fit_score ?? '—'}</span>
                  </div>
                  <div className="score-chip">
                    <span className="score-chip-label">Confidence</span>
                    <span className="score-chip-value">{c.fit_confidence ?? '—'}</span>
                  </div>
                </div>
                <p className="card-sub-label" style={{ margin: '14px 16px 6px' }}>DRAWS ON</p>
                <ChipRow items={c.signatures_engaged} wrapperClassName="option-card-sigs" />
                <div className="option-card-footer">
                  <label className="option-select-toggle">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => setActiveId(isActive ? null : c.id)}
                      disabled={options.submitting}
                    />
                    Select this path
                  </label>
                </div>
                {isActive && (
                  <div className="option-card-confirm">
                    <p className="card-sub-label">ANYTHING ELSE?</p>
                    <p className="documentation">{COMMENTS_EXPLANATION}</p>
                    <textarea
                      className="input-field input-field--textarea"
                      value={commentsByCandidate[c.id] ?? ''}
                      onChange={(e) =>
                        setCommentsByCandidate(prev => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder="Any additional comments, wishes, or requests before we build this out."
                      disabled={options.submitting}
                    />
                    <SubmitError error={options.submitError} />
                    <PrimaryButton onClick={() => handleConfirm(c.id)} disabled={options.submitting}>
                      {options.submitting ? 'Confirming…' : 'Confirm selection →'}
                    </PrimaryButton>
                  </div>
                )}
              </ConstellationCard>
            );
          })}

          {!atCap && !activeId && (
            <div className="card">
              <p className="card-sub-label">Want a different option?</p>
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
