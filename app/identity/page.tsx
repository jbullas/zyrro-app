'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrowRight, IconCheck, IconChevronDown, IconChevronUp, IconCircleCheck, IconLock, IconShare } from '@tabler/icons-react';
import { createClient } from '@/utils/supabase/client';
import { useAuthUser } from '@/lib/use-auth-user';
import PrimaryButton from '@/components/PrimaryButton';
import LinkButton from '@/components/LinkButton';
import MessageState from '@/components/MessageState';
import GeneratingState from '@/components/GeneratingState';
import IdentityBadge from '@/components/IdentityBadge';
import IdentityHero from '@/components/IdentityHero';
import SharePanel from '@/components/SharePanel';
import { useIdentityReport } from '@/lib/use-identity-report';
import { toIdentityHero } from '@/lib/identity-hero';
import { PATH_ENABLED } from '@/lib/feature-flags';
import { IDENTITY_REPORT_COPY as COPY, signatureHeadline } from '@/lib/identity-report-copy';
import type {
  SignatureDeepDive,
  PairingLine,
  DistinctivePattern,
  PatternToNotice,
} from '@/lib/artifact-schemas';

// 'has-questionnaire': answers exist, so the report is read through
// app/api/identity-report (#162), which decides what this user may see.
type PageState = 'loading' | 'anonymous' | 'no-questionnaire' | 'has-questionnaire';

interface PrimarySignatureEntry {
  name: string;
  domain: string;
  score: number;
  core_statement: string;
}

interface SecondarySignatureEntry {
  name: string;
  domain: string;
  score: number;
  core_statement: string;
}

// Only the fields /identity renders. Layer 3 fields (#154 step 1) are optional:
// absent on pre-1.4 reports and on any 1.4 report whose Layer 3 call failed.
interface IdentityReport {
  cover: {
    prepared_for: string;
    named_identity: string;
    identity_thesis: string;
  };
  primary_constellation: PrimarySignatureEntry[];
  secondary_signature_analysis?: SecondarySignatureEntry[];
  constellation_synthesis: { synthesis: string };
  energisers: string[];
  friction_points: string[];
  domain_profile: Record<string, number>;
  signature_deep_dives?: SignatureDeepDive[];
  pairings?: PairingLine[];
  distinctive_pattern?: DistinctivePattern;
  pattern_to_notice?: PatternToNotice;
}

type SignatureRowData = {
  name: string;
  domain: string;
  score: number;
  coreStatement: string;
  secondary: boolean;
};

// what_this_means is a [string, string] on current reports, but reports from
// between the step 1 iterations stored a single string: render that as one
// paragraph rather than failing.
function paragraphs(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

// Distinctive Pattern steps sometimes arrive lowercase ("explore"); show them
// sentence-cased on the chips.
function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function rowId(name: string): string {
  return `deep-dive-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export default function IdentityPage() {
  const router = useRouter();
  const [pageState, setPageState]   = useState<PageState>('loading');
  const [userId, setUserId]         = useState<string | null>(null);
  // Same entitlement read as app/path/page.tsx: null until checked.
  const [entitled, setEntitled]     = useState<boolean | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [unlockLoading, setUnlockLoading]     = useState(false);
  // #162: set only on return from a checkout that verify-checkout granted.
  // Page state, not storage, so a reload never shows the notice again.
  const [justUnlocked, setJustUnlocked]       = useState(false);
  const [openRows, setOpenRows]     = useState<Set<string>>(new Set());

  const { report: genPhase, retry } = useIdentityReport(pageState === 'has-questionnaire');
  const ready  = genPhase.phase === 'ready' ? genPhase : null;
  // locked: the route sent only the free projection (#162 paywall).
  const locked = ready?.locked ? ready.content : null;
  const report = ready && !ready.locked ? ready.content as IdentityReport : null;

  // #7: the owner's public share link (null = not shared) and its panel.
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const closeShare = useCallback(() => setShareOpen(false), []);

  // Once the report is ready, find out whether a link already exists, so the
  // button reads "Shared" on load.
  const reportReady = !!ready;
  useEffect(() => {
    if (!reportReady) return;
    let cancelled = false;
    fetch('/api/share-link')
      .then(res => (res.ok ? res.json() : null))
      .then((data: { url: string | null } | null) => { if (!cancelled && data) setShareLink(data.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reportReady]);

  const { user: authUser, loading: authLoading } = useAuthUser();

  // A failed report read sends the user to /login, as the direct read did;
  // no report row at all is the no-questionnaire state.
  useEffect(() => {
    if (genPhase.phase === 'error') router.push('/login');
  }, [genPhase.phase, router]);

  // Main load: checks auth and the questionnaire, then hands the report read
  // and polling to useIdentityReport.
  useEffect(() => {
    if (authLoading) return;
    const supabase = createClient();
    let cancelled  = false;

    function readAnswersCount(uid: string) {
      return supabase
        .from('discovery_answers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid);
    }

    // Mirrors app/path/page.tsx's entitlement gate exactly, including the
    // NEXT_PUBLIC_OPEN_ACCESS bypass. Read-only: entitlement and checkout
    // logic are unchanged.
    async function loadEntitlement(uid: string) {
      if (process.env.NEXT_PUBLIC_OPEN_ACCESS === 'true') {
        if (!cancelled) setEntitled(true);
        return;
      }
      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', uid)
        .eq('product', 'onetime_payment')
        .eq('status', 'active')
        .maybeSingle();
      if (!cancelled) setEntitled(!!entitlement);
    }

    async function init() {
      const user = authUser;

      if (!user) {
        if (!cancelled) setPageState('anonymous');
        return;
      }

      if (cancelled) return;
      setUserId(user.id);

      // #162: back from the identity checkout. Grant the entitlement before
      // the report is read, so it arrives unlocked without a reload, then drop
      // session_id from the URL so a reload doesn't verify (or notify) again.
      const sessionIdParam = new URLSearchParams(window.location.search).get('session_id');
      if (sessionIdParam) {
        try {
          const res = await fetch('/api/verify-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionIdParam }),
          });
          const { granted } = await res.json() as { granted?: boolean };
          if (!cancelled && granted) setJustUnlocked(true);
        } catch (err) {
          console.error('verify-checkout failed:', err);
        }
        window.history.replaceState({}, '', '/identity');
        if (cancelled) return;
      }

      const { count, error } = await readAnswersCount(user.id);
      if (cancelled) return;

      if (error) {
        router.push('/login');
        return;
      }

      if (!count || count === 0) {
        setPageState('no-questionnaire');
        return;
      }

      setPageState('has-questionnaire');
      await loadEntitlement(user.id);
    }

    init();
    return () => { cancelled = true; };
  }, [router, authLoading, authUser]);

  // ── Loading ────────────────────────────────────────────────────────
  if (pageState === 'loading') return null;

  // ── State 1: Anonymous ─────────────────────────────────────────────
  if (pageState === 'anonymous') {
    return (
      <MessageState
        eyebrow="IDENTITY SIGNATURE REPORT"
        heading="Your Identity Signature Report is waiting."
        headingLevel="h1"
        body="Create a free account to access your Named Identity and full Identity Signature Report."
        cta={<PrimaryButton href="/start">Start the questionnaire</PrimaryButton>}
      />
    );
  }

  // ── State 2: No questionnaire (or answers but no report row) ───────
  if (pageState === 'no-questionnaire' || genPhase.phase === 'none') {
    return (
      <MessageState
        eyebrow="IDENTITY SIGNATURE REPORT"
        heading="Your report isn’t ready yet."
        headingLevel="h1"
        body="Complete the questionnaire to generate your Identity Signature Report."
        cta={<PrimaryButton href="/start">Start the questionnaire</PrimaryButton>}
      />
    );
  }

  function handleRetry() {
    retry(() => fetch('/api/retry-generation', { method: 'POST' }));
  }

  // #162: every lock and the bottom strip start the identity checkout.
  async function handleUnlock() {
    setUnlockLoading(true);
    try {
      const res = await fetch('/api/identity-checkout', { method: 'POST' });
      const { url, error } = await res.json() as { url?: string; error?: string };
      if (error || !url) throw new Error(error ?? 'No checkout URL');
      window.location.href = url;
    } catch (err) {
      console.error('Identity checkout failed:', err);
      setUnlockLoading(false);
    }
  }

  async function handleCheckout() {
    if (!userId) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const { url, error } = await res.json() as { url?: string; error?: string };
      if (error || !url) throw new Error(error ?? 'No checkout URL');
      window.location.href = url;
    } catch (err) {
      console.error('Checkout failed:', err);
      setCheckoutLoading(false);
    }
  }

  // Both "Find your path" buttons: entitled users go straight to /path, everyone
  // else starts the existing checkout.
  function handleFindPath() {
    if (entitled) {
      router.push('/path');
      return;
    }
    handleCheckout();
  }

  // ── has-questionnaire: hook-driven generation states ───────────────
  // First read in flight, or on its way to /login.
  if (genPhase.phase === 'loading' || genPhase.phase === 'error') return null;

  if (genPhase.phase === 'spinner') {
    return (
      <GeneratingState
        heading="Your Identity Signature Report is being prepared."
        description={
          genPhase.variant === 'early'
            ? 'This usually takes about a minute.'
            : 'Still working — this is taking a little longer than usual…'
        }
      />
    );
  }

  if (genPhase.phase === 'come-back-later') {
    return (
      <GeneratingState
        spinner={false}
        description="Your report is still being prepared. This is taking longer than expected — you can leave this page and come back in a few minutes. It’ll be here when it’s ready."
      />
    );
  }

  if (genPhase.phase === 'failed') {
    return (
      <MessageState
        eyebrow="IDENTITY SIGNATURE REPORT"
        heading="Something went wrong."
        body="We couldn’t generate your report. Please try again."
        cta={<PrimaryButton onClick={handleRetry}>Try again</PrimaryButton>}
      />
    );
  }

  // ── State 3c: Ready ────────────────────────────────────────────────
  // #162: a report is either the full stored one (`report`) or, for unpaid
  // users under the paywall, the free projection (`locked`): free sections
  // plus presence flags for the locked ones. Both feed the same layout.
  if (!report && !locked) return null;

  const hero = report ? toIdentityHero(report) : locked!.hero;
  const energisers = report ? report.energisers : locked!.energisers;
  const friction_points = report ? report.friction_points : locked!.friction_points;
  const pairings = report?.pairings;
  const distinctive_pattern = report?.distinctive_pattern;
  const pattern_to_notice = report?.pattern_to_notice;
  const secondaries = report?.secondary_signature_analysis ?? [];

  const deepDives = new Map((report?.signature_deep_dives ?? []).map(d => [d.name, d]));
  const secondaryNames = new Set(secondaries.map(s => s.name));
  const rows: SignatureRowData[] = report
    ? [
        ...report.primary_constellation.map(s => ({ name: s.name, domain: s.domain, score: s.score, coreStatement: s.core_statement, secondary: false })),
        ...secondaries.map(s => ({ name: s.name, domain: s.domain, score: s.score, coreStatement: s.core_statement, secondary: true })),
      ]
    : locked!.rows.map(r => ({ name: r.name, domain: r.domain, score: r.score, coreStatement: '', secondary: r.secondary }));
  const lockedRows = new Set(locked ? locked.rows.filter(r => r.has_deep_dive).map(r => r.name) : []);
  const hasPairings = locked ? locked.has_pairings : Array.isArray(pairings) && pairings.length > 0;
  const hasPattern = locked ? locked.has_distinctive_pattern : !!distinctive_pattern;
  const hasPatternToNotice = locked ? locked.has_pattern_to_notice : !!pattern_to_notice;
  const ctaDisabled = checkoutLoading || entitled === null;

  function toggleRow(name: string) {
    setOpenRows(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function findPathButton(label: string, light = false) {
    return (
      <button
        type="button"
        className={`btn-cta${light ? ' btn-cta--light' : ''}`}
        onClick={handleFindPath}
        disabled={ctaDisabled}
      >
        {checkoutLoading ? 'Redirecting…' : label}
        <IconArrowRight size={18} stroke={2.2} aria-hidden="true" />
      </button>
    );
  }

  function lockedTeaser(eyebrow: string, line: string) {
    return (
      <LockedTeaser eyebrow={eyebrow} line={line} onUnlock={handleUnlock} disabled={unlockLoading} />
    );
  }

  const pairingsCard = hasPairings && (locked ? lockedTeaser(COPY.pairings.eyebrow, COPY.locks.pairings) : (
    <div className="card flex flex-col gap-12">
      <p className="eyebrow">{COPY.pairings.eyebrow}</p>
      <div className="divided-list">
        {pairings!.map(p => (
          <div key={`${p.a}|${p.b}`} className="flex flex-col gap-8">
            <h3>{COPY.pairings.title(p.a, p.b)}</h3>
            <p>{p.line}</p>
          </div>
        ))}
      </div>
    </div>
  ));

  const patternCard = hasPattern && (locked ? lockedTeaser(COPY.distinctivePattern.eyebrow, COPY.locks.distinctivePattern) : (
    <div className="card flex flex-col gap-12">
      <p className="eyebrow">{COPY.distinctivePattern.eyebrow}</p>
      <div className="chips-wrap items-center">
        {distinctive_pattern!.steps.map((step, i) => (
          <span key={`${step}-${i}`} className="inline-flex items-center gap-8">
            <span className="chip-tag">{capitalise(step)}</span>
            {i < distinctive_pattern!.steps.length - 1 && (
              <IconArrowRight size={18} stroke={2.2} color="var(--color-grad-2)" aria-hidden="true" />
            )}
          </span>
        ))}
      </div>
      {paragraphs(distinctive_pattern!.paragraphs).map((para, i) => <p key={i}>{para}</p>)}
    </div>
  ));

  return (
    <div className="flow-container flow-container--wide">
      <div className="scroll gap-16">

        {/* #162: once, on return from a granted checkout. */}
        {justUnlocked && report && (
          <div className="card flex items-center gap-8" role="status">
            <IconCircleCheck size={20} stroke={2} color="var(--color-success)" aria-hidden="true" />
            <p>{COPY.unlocked.notice}</p>
          </div>
        )}

        <IdentityHero
          hero={hero}
          action={
            <button type="button" className="btn-link btn-link-inline" onClick={() => setShareOpen(true)}>
              <span className="inline-flex items-center gap-8">
                <IconShare size={16} stroke={2} aria-hidden="true" />
                {shareLink ? COPY.share.buttonShared : COPY.share.button}
              </span>
            </button>
          }
        />
        {shareOpen && <SharePanel onClose={closeShare} onLinkChange={setShareLink} />}

        {/* ── Hero Path CTA (#162: hidden with Path off) ──────────── */}
        {PATH_ENABLED && (
          <div className="cta-card">
            <div className="flex flex-col gap-8">
              <h3>{COPY.heroCta.heading}</h3>
              <p>{COPY.heroCta.body}</p>
              <p className="cover-context-line">{COPY.heroCta.price}</p>
            </div>
            {findPathButton(COPY.heroCta.button)}
          </div>
        )}

        {/* ── Signatures in depth: one row per signature ──────────── */}
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-8">
            <p className="eyebrow">{COPY.depth.eyebrow}</p>
            <p className="documentation">{COPY.depth.scoreExplanation}</p>
          </div>
          {rows.map(row => {
            const dive = deepDives.get(row.name);
            // #162: a locked row has a deep dive the user hasn't unlocked.
            const rowLocked = lockedRows.has(row.name);
            const open = (!!dive || rowLocked) && openRows.has(row.name);
            const scored = row.score >= 1;
            const id = rowId(row.name);
            const rowContent = (
              <>
                <IdentityBadge primarySignatureName={row.name} size="sm" muted={row.secondary} />
                <div className="flex flex-col gap-1">
                  <h3>{row.name}</h3>
                  <p className="card-sub-label">{row.domain}</p>
                </div>
                <div className="sig-bar-track sig-bar-track--lg">
                  {scored && (
                    <div
                      className={row.secondary ? 'sig-bar-fill-muted' : 'sig-bar-fill'}
                      style={{ width: `${Math.min(100, (row.score / 25) * 100)}%` }}
                    />
                  )}
                </div>
                <span className={row.secondary ? 'sig-score-label-muted' : 'sig-score-label'}>
                  {scored ? COPY.depth.scoreOutOf(row.score) : COPY.depth.noScore}
                </span>
              </>
            );
            return (
              <div key={row.name} className={`card flex flex-col gap-20${open ? ' card--active' : ''}`}>
                {dive || rowLocked ? (
                  // The whole row is the toggle. The padding is cancelled by equal
                  // negative margins, so the content box (and the bars) don't move;
                  // it only gives the hover tint some room.
                  <button
                    type="button"
                    className="sig-depth-row w-[calc(100%+16px)] -mx-[8px] -my-[6px] px-[8px] py-[6px] rounded-[var(--radius-md)] text-left cursor-pointer hover:bg-[var(--color-bg)]"
                    aria-expanded={open}
                    aria-controls={id}
                    aria-label={open ? COPY.depth.collapse(row.name) : rowLocked ? COPY.locks.toggleAria(row.name) : COPY.depth.expand(row.name)}
                    onClick={() => toggleRow(row.name)}
                  >
                    {rowContent}
                    <span data-row-toggle-label className="inline-flex items-center justify-end gap-1 text-[13px] font-semibold text-[var(--color-grad-2)]">
                      {open ? COPY.depth.close : rowLocked ? (
                        <>
                          <IconLock size={16} stroke={2.2} aria-hidden="true" />
                          {COPY.locks.toggle}
                        </>
                      ) : COPY.depth.explore}
                      {open ? <IconChevronUp size={16} stroke={2.2} aria-hidden="true" /> : !rowLocked && <IconChevronDown size={16} stroke={2.2} aria-hidden="true" />}
                    </span>
                  </button>
                ) : (
                  <div className="sig-depth-row">
                    {rowContent}
                    <span aria-hidden="true" />
                  </div>
                )}
                {dive && open && (
                  <DeepDive
                    id={id}
                    name={row.name}
                    coreStatement={row.coreStatement}
                    dive={dive}
                    secondaryNames={secondaryNames}
                  />
                )}
                {rowLocked && open && (
                  <div id={id} className="flex flex-col gap-12">
                    <p>{COPY.locks.deepDive}</p>
                    <UnlockLink onUnlock={handleUnlock} disabled={unlockLoading} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Pairings + Distinctive Pattern (each omitted when missing) ── */}
        {pairingsCard && patternCard ? (
          <div className="grid-2">{pairingsCard}{patternCard}</div>
        ) : (pairingsCard || patternCard || null)}

        {/* ── Energy / Drains ─────────────────────────────────────── */}
        <div className="grid-2">
          <div className="card flex flex-col gap-12">
            <p className="eyebrow">{COPY.energy.eyebrow}</p>
            <ul className="energiser-bullets">
              {energisers.map(item => (
                <li key={item}><span className="bullet-icon">+</span><span>{item}</span></li>
              ))}
            </ul>
          </div>
          <div className="card flex flex-col gap-12">
            <p className="eyebrow">{COPY.drains.eyebrow}</p>
            <ul className="friction-bullets">
              {friction_points.map(item => (
                <li key={item}><span className="bullet-icon">–</span><span>{item}</span></li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Path invitation (#162: hidden with Path off) ────────── */}
        {PATH_ENABLED && (
          <div className="row-between flex-wrap gap-16">
            <p>{COPY.pathInvitation.body}</p>
            <LinkButton href="/path" inline>
              <span className="inline-flex items-center gap-8">
                {COPY.pathInvitation.link}
                <IconArrowRight size={16} stroke={2.2} aria-hidden="true" />
              </span>
            </LinkButton>
          </div>
        )}

        {/* ── The Pattern to Notice ───────────────────────────────── */}
        {hasPatternToNotice && (locked ? lockedTeaser(COPY.patternToNotice.eyebrow, COPY.locks.patternToNotice) : (
          <div className="card flex flex-col gap-12">
            <p className="eyebrow">{COPY.patternToNotice.eyebrow}</p>
            <h2>{pattern_to_notice!.headline}</h2>
            <p>{pattern_to_notice!.body}</p>
            <p><strong>{pattern_to_notice!.takeaway}</strong></p>
          </div>
        ))}

        {/* ── Bottom CTA strip: the unlock pitch on a locked report
               (#162), else the Path strip, hidden with Path off ─────── */}
        {locked ? (
          <div className="section-cta section-cta--report">
            <div className="flex flex-col gap-12">
              <h2>{COPY.unlockCta.heading}</h2>
              <p>{COPY.unlockCta.body}</p>
              <ul className="bullet-list">
                {COPY.unlockCta.bullets.map(item => (
                  <li key={item} className="bullet-item">
                    <IconCheck size={18} stroke={2.4} color="#fff" aria-hidden="true" className="shrink-0 mt-[3px]" />
                    <p>{item}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <button
                type="button"
                className="btn-cta btn-cta--light"
                onClick={handleUnlock}
                disabled={unlockLoading}
              >
                {unlockLoading ? 'Redirecting…' : COPY.unlockCta.button(ready?.locked ? ready.unlockPrice : null)}
                <IconArrowRight size={18} stroke={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : PATH_ENABLED && (
          <div className="section-cta section-cta--report">
            <div className="flex flex-col gap-8">
              <h2>{COPY.bottomCta.heading}</h2>
              <p>{COPY.bottomCta.body}</p>
            </div>
            <div>
              {findPathButton(COPY.bottomCta.button, true)}
              <p>{COPY.bottomCta.price}</p>
            </div>
          </div>
        )}

        {/* ── Footer (no links until Privacy/Terms/Help pages exist — #157) ── */}
        <footer className="report-footer">
          <p className="documentation">{COPY.footer.disclaimer}</p>
        </footer>

      </div>{/* end .scroll */}
    </div>
  );
}

// #162: the "Unlock your full report" text link inside every lock.
function UnlockLink({ onUnlock, disabled }: { onUnlock: () => void; disabled: boolean }) {
  // The wrapper keeps the link at its own width (left-aligned) instead of
  // stretching across the flex column, where .btn-link would centre it.
  return (
    <div>
      <LinkButton inline onClick={onUnlock} disabled={disabled}>
        {COPY.locks.link}
      </LinkButton>
    </div>
  );
}

// #162: stands in for a locked section (Pairings, Distinctive Pattern, The
// Pattern to Notice) on an unpaid report.
function LockedTeaser({
  eyebrow,
  line,
  onUnlock,
  disabled,
}: {
  eyebrow: string;
  line: string;
  onUnlock: () => void;
  disabled: boolean;
}) {
  return (
    <div className="card flex flex-col gap-12">
      <div className="row-between">
        <p className="eyebrow">{eyebrow}</p>
        <IconLock size={18} stroke={2} color="var(--color-grad-2)" aria-hidden="true" />
      </div>
      <p>{line}</p>
      <UnlockLink onUnlock={onUnlock} disabled={disabled} />
    </div>
  );
}

function DeepDive({
  id,
  name,
  coreStatement,
  dive,
  secondaryNames,
}: {
  id: string;
  name: string;
  coreStatement: string;
  dive: SignatureDeepDive;
  secondaryNames: Set<string>;
}) {
  const labels = COPY.deepDive.operatingLabels;
  // Entries without a kind (reports before "Watch out for") are synergy.
  const worksBestWith = dive.works_with.filter(w => w.kind !== 'tension');
  const watchOutFor = dive.works_with.filter(w => w.kind === 'tension');
  return (
    <div id={id} className="flex flex-col gap-20">
      <div className="flex flex-col gap-8">
        <h2>{signatureHeadline(name)}</h2>
        <p>{coreStatement}</p>
      </div>

      <div className="grid-split">
        <div className="flex flex-col gap-20">
          <div className="flex flex-col gap-8">
            <p className="eyebrow">{COPY.deepDive.whatThisMeans}</p>
            {paragraphs(dive.what_this_means).map((para, i) => <p key={i}>{para}</p>)}
          </div>
          {dive.evidence.length > 0 && (
            <div className="flex flex-col gap-12">
              <p className="eyebrow">{COPY.deepDive.evidence}</p>
              {dive.evidence.map((e, i) => <p key={i} className="evidence-item">{e.text}</p>)}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-12">
          <div className="panel flex flex-col gap-8">
            <p className="eyebrow">{COPY.deepDive.showsUp}</p>
            <ul className="bullet-list">
              {dive.shows_up.map(item => <li key={item} className="bullet-item"><span className="bullet-dot" />{item}</li>)}
            </ul>
          </div>
          <div className="panel flex flex-col gap-8">
            <p className="eyebrow">{COPY.deepDive.servesYou}</p>
            <ul className="bullet-list">
              {dive.serves_you.map(item => <li key={item} className="bullet-item"><span className="bullet-dot" />{item}</li>)}
            </ul>
          </div>
        </div>
      </div>

      {(worksBestWith.length > 0 || watchOutFor.length > 0) && (
        <div className="grid-2">
          {([
            [COPY.deepDive.worksBestWith, worksBestWith],
            [COPY.deepDive.watchOutFor, watchOutFor],
          ] as const).map(([heading, entries]) => entries.length > 0 && (
            <div key={heading} className="flex flex-col gap-12">
              <p className="eyebrow">{heading}</p>
              {entries.map(w => (
                <div key={w.partner} className="panel flex flex-col gap-8">
                  <div className="flex items-center gap-12">
                    <IdentityBadge primarySignatureName={w.partner} size="sm" muted={secondaryNames.has(w.partner)} />
                    <h3>{w.partner}</h3>
                  </div>
                  <p>{w.text}</p>
                  <p className="evidence-item">{w.evidence}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-12">
        <p className="eyebrow">{COPY.deepDive.operating}</p>
        <div className="grid-4">
          {(Object.keys(labels) as (keyof typeof labels)[]).map(key => (
            <div key={key} className="panel flex flex-col gap-8">
              <h3>{labels[key]}</h3>
              <p>{dive.operating[key]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel panel--warm flex flex-col gap-8">
          <p className="eyebrow">{COPY.deepDive.friction}</p>
          <p>{dive.friction}</p>
        </div>
        <div className="panel panel--warm flex flex-col gap-8">
          <p className="eyebrow">{COPY.deepDive.underPressure}</p>
          <p>{dive.under_pressure}</p>
        </div>
      </div>
    </div>
  );
}
