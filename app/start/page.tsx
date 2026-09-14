'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrowRight } from '@tabler/icons-react';
import { QUESTIONS, mergeAnswersWithQuestions, type MergedAnswer } from '@/lib/identity-questions';
import { createClient } from '@/utils/supabase/client';
import { useAuthUser } from '@/lib/use-auth-user';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';
import LinkButton from '@/components/LinkButton';
import BackButton from '@/components/BackButton';
import QuestionAnswerList from '@/components/QuestionAnswerList';

const DELIVERABLES = [
  'Your Named Identity',
  'Your Top 5 Identity Signatures',
  'How you operate, think and decide',
  'What energises you, and what drains you',
];

type Screen = 'intro' | 'question' | 'contact' | 'check-email' | 'already-registered';

// #20: auth-awareness layered on top of the pre-existing anonymous flow.
// 'checking' while auth + discovery_answers are being resolved; 'anonymous'
// is the untouched State 1; 'state2'/'state3' below.
type Mode = 'checking' | 'anonymous' | 'state2' | 'state3';

const DISCOVERY_ANSWERS_KEY = 'zyrro_discovery_answers';
const USER_NAME_KEY = 'zyrro_user_name';

type StoredDiscoveryAnswers = {
  ownerId: string | null;
  answers: Array<{ question_number: number; question_text: string; answer_text: string }>;
};

type StoredUserName = {
  ownerId: string;
  name: string;
};

// #leak-fix: localStorage can't prove which visitor a stored blob belongs
// to, so every write is stamped with an ownerId (a real Supabase user id,
// or null for an anonymous writer) and every read is gated on that stamp
// matching the CURRENT visitor's resolved identity exactly. An anonymous
// resolvedOwnerId (null) never matches anything — localStorage can't tell
// two different anonymous visitors apart, so anonymous visits never trust
// a pre-existing blob, even one they wrote themselves in an earlier tab
// load. Anything not provably owned by the current visitor is wiped
// outright rather than partially trusted.
function clearStorageUnlessOwnedBy(resolvedOwnerId: string | null) {
  for (const key of [DISCOVERY_ANSWERS_KEY, USER_NAME_KEY]) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    let stampedOwnerId: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { ownerId?: unknown };
      stampedOwnerId = typeof parsed.ownerId === 'string' ? parsed.ownerId : null;
    } catch {
      stampedOwnerId = null;
    }
    const trusted = resolvedOwnerId !== null && stampedOwnerId === resolvedOwnerId;
    if (!trusted) localStorage.removeItem(key);
  }
}

// Call only after clearStorageUnlessOwnedBy has run for the same
// resolvedOwnerId — whatever's left at that point is already trusted.
function readOwnedDiscoveryAnswers(): StoredDiscoveryAnswers['answers'] | null {
  const raw = localStorage.getItem(DISCOVERY_ANSWERS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDiscoveryAnswers;
    if (!Array.isArray(parsed.answers)) return null;
    return parsed.answers;
  } catch {
    return null;
  }
}

export default function StartPage() {
  const router = useRouter();
  const supabase = createClient();

  const [screen, setScreen] = useState<Screen>('intro');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(13).fill(''));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contactError, setContactError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [mode, setMode] = useState<Mode>('checking');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [qaItems, setQaItems] = useState<MergedAnswer[]>([]);
  const [submitError, setSubmitError] = useState('');

  const { user: authUser, loading: authLoading } = useAuthUser();

  // #20 State 2/3 branch: resolve auth + discovery_answers once on mount.
  // The identity gate (clearStorageUnlessOwnedBy) runs first, synchronously
  // within this same async function, before anything reads
  // zyrro_discovery_answers into UI state — folding the old always-on,
  // unconditional prefill effect in here (rather than keeping it as a
  // separate effect) is what closes the race that used to let a prior
  // browser occupant's answers get prefilled before auth was resolved. The
  // user itself now comes from the shared, deduped useAuthUser() fetch (see
  // lib/use-auth-user.ts, #146's real fix) rather than its own getUser()
  // call — this effect waits for that shared fetch to resolve before doing
  // anything, so the ordering guarantee is unchanged.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function resolveMode() {
      const user = authUser;
      const resolvedOwnerId = user?.id ?? null;

      clearStorageUnlessOwnedBy(resolvedOwnerId);
      if (cancelled) return;
      setOwnerId(resolvedOwnerId);

      const owned = readOwnedDiscoveryAnswers();
      if (owned && !cancelled) {
        setAnswers(prev => {
          const loaded = [...prev];
          owned.forEach(item => {
            if (item.question_number >= 1 && item.question_number <= 13) {
              loaded[item.question_number - 1] = item.answer_text || '';
            }
          });
          return loaded;
        });
      }

      if (!user) {
        if (!cancelled) setMode('anonymous');
        return;
      }

      const { data: rows, error } = await supabase
        .from('discovery_answers')
        .select('question_number, answer_text')
        .eq('user_id', user.id);

      if (cancelled) return;

      // On a query error, fall through to State 3 rather than State 1 — this
      // user is already authenticated, so the anonymous signUp() flow would
      // be actively wrong for them (it would try to create a second
      // account). State 3's submit path still works off a real session.
      if (error || !rows || rows.length === 0) {
        setMode('state3');
        return;
      }

      setQaItems(mergeAnswersWithQuestions(rows));
      setMode('state2');
    }

    resolveMode();
    return () => { cancelled = true; };
  }, [supabase, authLoading, authUser]);

  const currentQuestion = QUESTIONS[questionIndex];
  const currentAnswer = answers[questionIndex] || '';

  function updateAnswer(value: string) {
    setAnswers(prev => {
      const next = [...prev];
      next[questionIndex] = value.slice(0, 5000);
      return next;
    });
  }

  function saveToStorage(currentAnswers: string[]) {
    const data: StoredDiscoveryAnswers = {
      ownerId,
      answers: QUESTIONS.map((q, i) => ({
        question_number: q.number,
        question_text: q.question,
        answer_text: currentAnswers[i] || '',
      })),
    };
    localStorage.setItem(DISCOVERY_ANSWERS_KEY, JSON.stringify(data));
  }

  function handleBack() {
    saveToStorage(answers);
    if (questionIndex === 0) {
      setScreen('intro');
    } else {
      setQuestionIndex(qi => qi - 1);
    }
  }

  function handleContinue() {
    saveToStorage(answers);
    if (questionIndex === 12) {
      if (mode === 'state3') {
        handleFinishState3();
      } else {
        setScreen('contact');
      }
    } else {
      setQuestionIndex(qi => qi + 1);
    }
  }

  // #20 State 3: final step skips the contact/signUp() screen entirely —
  // already authenticated, so the answers go straight to the live session
  // via POST /api/complete-discovery instead.
  async function handleFinishState3() {
    setSubmitError('');
    setSubmitting(true);
    const payload = QUESTIONS.map((q, i) => ({
      question_number: q.number,
      answer_text: (answers[i] || '').slice(0, 5000),
    }));
    try {
      const res = await fetch('/api/complete-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payload }),
      });
      if (!res.ok) throw new Error('Submission failed');
      localStorage.removeItem(DISCOVERY_ANSWERS_KEY);
      router.push('/identity');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setContactError('');
    setSubmitting(true);

    // Read answers from localStorage; strip question_text — lives server-side in QUESTIONS
    const stored = localStorage.getItem(DISCOVERY_ANSWERS_KEY);
    let discoveryAnswers: Array<{ question_number: number; answer_text: string }> = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredDiscoveryAnswers;
        if (Array.isArray(parsed.answers)) {
          discoveryAnswers = parsed.answers.map(a => ({
            question_number: a.question_number,
            answer_text: a.answer_text.slice(0, 5000),
          }));
        }
      } catch {}
    }

    // #106: stage answers server-side and pass only an opaque token through
    // signUp()'s metadata — raw answers no longer go into the auth cookie.
    let discoveryToken: string;
    try {
      const stageRes = await fetch('/api/stage-discovery-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: discoveryAnswers }),
      });
      if (!stageRes.ok) throw new Error('Staging failed');
      const stageData = await stageRes.json() as { id: string };
      discoveryToken = stageData.id;
    } catch {
      setContactError('Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: crypto.randomUUID(),
      options: {
        data: { display_name: name, discovery_token: discoveryToken },
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    });

    if (signUpError || !signUpData.user) {
      setContactError(signUpError?.message ?? 'Sign up failed. Please try again.');
      setSubmitting(false);
      return;
    }

    // Supabase's anti-enumeration behavior: signing up again with an email
    // that already belongs to a CONFIRMED account returns 200 with a user
    // object (a decoy id, not the real account's) but an empty `identities`
    // array — no error, no actual email sent. `identities` can also come
    // back undefined depending on client/project config, so treat anything
    // that isn't a non-empty array as the same case. Must not be read as
    // success: don't stamp localStorage with the decoy id, and keep the
    // staged discovery answers so they're still there if the person logs
    // into their real account instead.
    if (!signUpData.user.identities || signUpData.user.identities.length === 0) {
      setSubmitting(false);
      setScreen('already-registered');
      return;
    }

    const nameData: StoredUserName = { ownerId: signUpData.user.id, name };
    localStorage.setItem(USER_NAME_KEY, JSON.stringify(nameData));
    localStorage.removeItem(DISCOVERY_ANSWERS_KEY);
    setSubmitting(false);
    setScreen('check-email');
  }

  async function handleResend() {
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/auth/callback' },
    });
  }

  // ── #20: resolving auth + discovery_answers ─────────────────────────
  if (mode === 'checking') return null;

  // ── #20 State 2: already completed, read-only ────────────────────────
  if (mode === 'state2') {
    return (
      <div className="flow-container">
        <div className="scroll">
          <div className="section cover">
            <p className="eyebrow">IDENTITY SIGNATURE REPORT</p>
            <h1>You&rsquo;ve already answered these.</h1>
            <p>Your 13 discovery answers, for reference.</p>
          </div>
          <div className="section">
            <QuestionAnswerList items={qaItems} />
          </div>
        </div>
      </div>
    );
  }

  // ── CONTACT COLLECTION ─────────────────────────────────────────────
  if (screen === 'contact') {
    return (
      <div className="flow-container">
        <div className="scroll-area scroll-area--intro">
          <p className="eyebrow">YOUR IDENTITY REPORT IS READY</p>

          <h1>Create your free account to see your report</h1>

          <p>Your Named Identity and full Signature Report are waiting.</p>

          <form onSubmit={handleContactSubmit} className="page-form" style={{ maxWidth: '100%' }}>
            <input
              className="input-field"
              type="text"
              placeholder="Your first name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />

            <input
              className="input-field"
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            {contactError && <p className="form-error">{contactError}</p>}

            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Get my Identity Report'}
            </PrimaryButton>

            <p className="form-helper">Free. No credit card required.</p>
          </form>
        </div>
      </div>
    );
  }

  // ── ALREADY REGISTERED ────────────────────────────────────────────
  if (screen === 'already-registered') {
    return (
      <div className="flow-container">
        <div className="scroll-area scroll-area--intro">
          <p className="eyebrow">ONE MORE STEP</p>

          <h1>You already have an account</h1>

          <p>An account for {email} already exists. Log in to pick up where you left off.</p>

          <PrimaryButton href="/login">Log in</PrimaryButton>
        </div>
      </div>
    );
  }

  // ── CHECK YOUR EMAIL ───────────────────────────────────────────────
  if (screen === 'check-email') {
    return (
      <div className="flow-container">
        <div className="scroll-area scroll-area--intro">
          <p className="eyebrow">ONE MORE STEP</p>

          <h1>Check your inbox</h1>

          <p>We sent a confirmation link to {email}. Click it to access your report.</p>

          <p className="form-helper">Can&rsquo;t find it? Check your spam folder.</p>

          <LinkButton onClick={handleResend}>
            Resend the link
          </LinkButton>
        </div>
      </div>
    );
  }

  // ── INTRO ──────────────────────────────────────────────────────────
  if (screen === 'intro') {
    return (
      <div className="flow-container">
        <div className="scroll-area scroll-area--intro">
          <p className="eyebrow">IDENTITY SIGNATURE REPORT</p>

          <h1>Find out exactly how you&rsquo;re wired, and why it matters.</h1>

          <p>
            Answer 13 questions about your life and work. Zyrro detects the patterns and generates
            your personal Identity Signature Report.
          </p>

          <div className="deliverables-list">
            {DELIVERABLES.map(item => (
              <div key={item} className="flex-start-row gap-12">
                <div className="deliverable-icon">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="deliverable-label">{item}</span>
              </div>
            ))}
          </div>

          <div className="stats-pill">
            {['12 minutes', '13 questions', 'Private'].map((item, i) => (
              <span key={item} className="stats-item">
                <span className="stats-label">{item}</span>
                {i < 2 && <span className="sep-dot" />}
              </span>
            ))}
          </div>

          <PrimaryButton
            onClick={() => {
              setQuestionIndex(0);
              setScreen('question');
            }}
          >
            Begin
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ── QUESTION ───────────────────────────────────────────────────────
  const progress = ((questionIndex + 1) / 13) * 100;
  const canContinue = currentAnswer.trim().length >= 1;

  return (
    <div className="flow-container">
      {/* Progress bar */}
      <div className="progress-bar-header">
        <div className="row-between mb-8">
          <span className="label-micro">Question {questionIndex + 1} of 13</span>
          <span className="label-micro">{questionIndex + 1}/13</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="scroll-area scroll-area--question">
        {/* Question header */}
        <div className="flex-start-row gap-16">
          <div className="question-number">
            {currentQuestion.number}
          </div>
          <div className="flex-1">
            <p className="question-text" style={{ margin: '0 0 5px' }}>
              {currentQuestion.question}
            </p>
            <p className="question-hint">
              {currentQuestion.hint}
            </p>
          </div>
        </div>

        {/* Answer */}
        <div>
          <textarea
            value={currentAnswer}
            onChange={e => updateAnswer(e.target.value)}
            placeholder="Type your answer here…"
            className="input-field input-field--textarea"
          />
          <div className="char-counter-row">
            <span
              className={`char-counter${currentAnswer.length >= 4500 ? ' char-counter--limit' : ''}`}
            >
              {currentAnswer.length}/5000
            </span>
          </div>
        </div>

        {submitError && <p className="form-error">{submitError}</p>}

        {/* Navigation buttons */}
        <div className="row-between">
          <BackButton onClick={handleBack} />
          <SecondaryButton onClick={handleContinue} disabled={!canContinue || submitting}>
            {submitting ? 'Submitting…' : (questionIndex === 12 ? 'Finish' : 'Continue')}
            <IconArrowRight size={16} stroke={2} />
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
