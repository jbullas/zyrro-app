'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrowRight } from '@tabler/icons-react';
import { QUESTIONS, mergeAnswersWithQuestions, type MergedAnswer } from '@/lib/identity-questions';
import { createClient } from '@/utils/supabase/client';
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

type Screen = 'intro' | 'question' | 'contact' | 'check-email';

// #20: auth-awareness layered on top of the pre-existing anonymous flow.
// 'checking' while auth + discovery_answers are being resolved; 'anonymous'
// is the untouched State 1; 'state2'/'state3' below.
type Mode = 'checking' | 'anonymous' | 'state2' | 'state3';

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
  const [qaItems, setQaItems] = useState<MergedAnswer[]>([]);
  const [submitError, setSubmitError] = useState('');

  // #20 State 2/3 branch: resolve auth + discovery_answers once on mount.
  // Kept as its own effect, entirely separate from the localStorage-prefill
  // effect below, so State 1's existing behavior is untouched either way.
  useEffect(() => {
    let cancelled = false;

    async function resolveMode() {
      const { data: { user } } = await supabase.auth.getUser();
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
  }, [supabase]);

  useEffect(() => {
    const stored = localStorage.getItem('zyrro_discovery_answers');
    if (!stored) return;
    try {
      const data = JSON.parse(stored) as Array<{ question_number: number; answer_text: string }>;
      if (!Array.isArray(data)) return;
      setAnswers(prev => {
        const loaded = [...prev];
        data.forEach(item => {
          if (item.question_number >= 1 && item.question_number <= 13) {
            loaded[item.question_number - 1] = item.answer_text || '';
          }
        });
        return loaded;
      });
    } catch {}
  }, []);

  const currentQuestion = QUESTIONS[questionIndex];
  const currentAnswer = answers[questionIndex] || '';

  function updateAnswer(value: string) {
    setAnswers(prev => {
      const next = [...prev];
      next[questionIndex] = value.slice(0, 1000);
      return next;
    });
  }

  function saveToStorage(currentAnswers: string[]) {
    const data = QUESTIONS.map((q, i) => ({
      question_number: q.number,
      question_text: q.question,
      answer_text: currentAnswers[i] || '',
    }));
    localStorage.setItem('zyrro_discovery_answers', JSON.stringify(data));
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
      answer_text: (answers[i] || '').slice(0, 1000),
    }));
    try {
      const res = await fetch('/api/complete-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payload }),
      });
      if (!res.ok) throw new Error('Submission failed');
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
    const stored = localStorage.getItem('zyrro_discovery_answers');
    let discoveryAnswers: Array<{ question_number: number; answer_text: string }> = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Array<{ question_number: number; question_text: string; answer_text: string }>;
        if (Array.isArray(parsed)) {
          discoveryAnswers = parsed.map(a => ({
            question_number: a.question_number,
            answer_text: a.answer_text.slice(0, 1000),
          }));
        }
      } catch {}
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: crypto.randomUUID(),
      options: {
        data: { display_name: name, discovery_answers: discoveryAnswers },
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    });

    if (signUpError || !signUpData.user) {
      setContactError(signUpError?.message ?? 'Sign up failed. Please try again.');
      setSubmitting(false);
      return;
    }

    localStorage.setItem('zyrro_user_name', name);
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
        <div className="report-scroll">
          <div className="report-cover">
            <p className="eyebrow">IDENTITY SIGNATURE REPORT</p>
            <h1>You&rsquo;ve already answered these.</h1>
            <p>Your 13 discovery answers, for reference.</p>
          </div>
          <QuestionAnswerList items={qaItems} />
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
              className={`char-counter${currentAnswer.length >= 900 ? ' char-counter--limit' : ''}`}
            >
              {currentAnswer.length}/1000
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
