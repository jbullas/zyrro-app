import ChipRow from '@/components/ChipRow';
import SecondaryButton from '@/components/SecondaryButton';
import SelectableList from '@/components/SelectableList';
import SubmitError from '@/components/SubmitError';
import type { PathDirectionState } from '@/lib/use-path-direction';

// #134 Slice 1 — Checkpoint 1 "Direction" content, extracted out of
// app/path/page.tsx into its own component. This isn't just organization:
// having this JSX inline in PathPage's render body pushed that function
// over a size/complexity point where TypeScript's control-flow analysis
// stopped narrowing the old checkpointPhase discriminated union correctly
// (confirmed by moving it out, which fixed the resulting type errors —
// PathPage itself still owns the direction.loading/error early returns,
// only these four content branches live here).
//
// Static copy (matches /identity's descriptive, non-promotional register,
// not gated on paid tier — per /identity's own precedent).
const DIRECTION_INTRO =
  'Before we generate real directions, we need to know what actually matters to you. No new ' +
  'analysis here — just you telling us what to build toward and what to build away from.';

const MUST_HAVES_EXPLANATION =
  'Pick up to 3 from the list. Every direction we generate next will have to genuinely include these.';

const MUST_AVOIDS_EXPLANATION =
  'Pick up to 3 from the list. Every direction we generate next will steer clear of these.';

const IDEAL_LIFE_EXPLANATION =
  'Optional, but useful — anything you say here shapes how closely the generated directions match ' +
  'the life you actually want, not just the work.';

const DIRECTION_SAVED_EXPLANATION =
  'Your directions are next — we’re not generating them quite yet, but everything you picked here is saved.';

type DirectionFlowProps = {
  direction: PathDirectionState & { content: NonNullable<PathDirectionState['content']>; step: NonNullable<PathDirectionState['step']> };
  draftMustHaves: string[];
  setDraftMustHaves: (updater: (prev: string[]) => string[]) => void;
  draftMustAvoids: string[];
  setDraftMustAvoids: (updater: (prev: string[]) => string[]) => void;
  draftIdealLife: string;
  setDraftIdealLife: (text: string) => void;
};

export default function DirectionFlow({
  direction, draftMustHaves, setDraftMustHaves, draftMustAvoids, setDraftMustAvoids, draftIdealLife, setDraftIdealLife,
}: DirectionFlowProps) {
  const directionCover = (
    <div className="section cover">
      <p className="eyebrow">Your Path</p>
      <h1>Direction</h1>
      {direction.preparedFor && <p className="cover-context-line">{direction.preparedFor}</p>}
      <p className="identity-thesis">{DIRECTION_INTRO}</p>
    </div>
  );

  if (direction.step === 'must_haves') {
    return (
      <div className="flow-container">
        <div className="scroll">
          {directionCover}
          <div className="section">
            <p className="eyebrow">CHECKPOINT 1 · DIRECTION</p>
            <p className="card-sub-label">MUST HAVES</p>
            <p className="documentation">{MUST_HAVES_EXPLANATION}</p>
            <p className="selection-count">{draftMustHaves.length} of 3 selected</p>
            <SelectableList
              items={direction.energisers}
              selected={draftMustHaves}
              max={3}
              variant="positive"
              disabled={direction.submitting}
              onToggle={(item) => setDraftMustHaves(prev =>
                prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item],
              )}
            />
            <SubmitError error={direction.submitError} />
            <div className="card">
              <SecondaryButton
                onClick={() => direction.submitMustHaves(draftMustHaves)}
                disabled={direction.submitting}
              >
                {direction.submitting ? 'Saving…' : 'Continue →'}
              </SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (direction.step === 'must_avoids') {
    return (
      <div className="flow-container">
        <div className="scroll">
          {directionCover}
          <div className="section">
            <p className="eyebrow">CHECKPOINT 1 · DIRECTION</p>
            <p className="card-sub-label">MUST AVOIDS</p>
            <p className="documentation">{MUST_AVOIDS_EXPLANATION}</p>
            <p className="selection-count">{draftMustAvoids.length} of 3 selected</p>
            <SelectableList
              items={direction.frictionPoints}
              selected={draftMustAvoids}
              max={3}
              variant="negative"
              disabled={direction.submitting}
              onToggle={(item) => setDraftMustAvoids(prev =>
                prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item],
              )}
            />
            <SubmitError error={direction.submitError} />
            <div className="card">
              <SecondaryButton
                onClick={() => direction.submitMustAvoids(draftMustAvoids)}
                disabled={direction.submitting}
              >
                {direction.submitting ? 'Saving…' : 'Continue →'}
              </SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (direction.step === 'ideal_life') {
    return (
      <div className="flow-container">
        <div className="scroll">
          {directionCover}
          <div className="section">
            <p className="eyebrow">CHECKPOINT 1 · DIRECTION</p>
            <p className="card-sub-label">IDEAL LIFE</p>
            <p className="documentation">{IDEAL_LIFE_EXPLANATION}</p>
            <div className="card">
              <textarea
                className="input-field input-field--textarea"
                value={draftIdealLife}
                onChange={(e) => setDraftIdealLife(e.target.value)}
                placeholder="What does an ideal life look like?"
                disabled={direction.submitting}
              />
            </div>
            <SubmitError error={direction.submitError} />
            <div className="card">
              <SecondaryButton
                onClick={() => direction.submitIdealLife(draftIdealLife)}
                disabled={direction.submitting}
              >
                {direction.submitting ? 'Saving…' : 'Save and continue →'}
              </SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // direction.step === 'complete' — Slice 1's terminal state. Checkpoint 2
  // ("Options") isn't built yet (#134 Slice 2), so this is where the flow
  // stops for now rather than falling through to the old, unwired
  // sessionId-based Checkpoint 2/3/report machinery in PathPage.
  const savedMustHaves = direction.content.must_haves ?? [];
  const savedMustAvoids = direction.content.must_avoids ?? [];

  return (
    <div className="flow-container">
      <div className="scroll">
        {directionCover}
        <div className="section">
          <p className="eyebrow">CHECKPOINT 1 · DIRECTION</p>
          <p className="documentation">{DIRECTION_SAVED_EXPLANATION}</p>
          {savedMustHaves.length > 0 && (
            <div className="card">
              <p className="card-sub-label">MUST HAVES</p>
              <ChipRow items={savedMustHaves} wrapperClassName="chips-wrap" />
            </div>
          )}
          {savedMustAvoids.length > 0 && (
            <div className="card">
              <p className="card-sub-label">MUST AVOIDS</p>
              <ChipRow items={savedMustAvoids} wrapperClassName="chips-wrap" />
            </div>
          )}
          {direction.content.ideal_life && (
            <div className="card">
              <p className="card-sub-label">IDEAL LIFE</p>
              <p>{direction.content.ideal_life}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
