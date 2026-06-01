'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { QUESTIONS } from '@/lib/identity-questions';
import { createClient } from '@/utils/supabase/client';

const GENERATING_STEPS = [
  'Detecting your signatures',
  'Mapping your constellation',
  'Generating your Named Identity',
  'Writing your report',
];

const DELIVERABLES = [
  'Your Named Identity',
  'Your Top 5 Identity Signatures',
  'How you operate, think and decide',
  'What energises you, and what drains you',
];

type Screen = 'intro' | 'question' | 'generating' | 'contact' | 'check-email';

export default function StartPage() {
  const router = useRouter();
  const supabase = createClient();

  const [screen, setScreen] = useState<Screen>('intro');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(13).fill(''));
  const [generatingStep, setGeneratingStep] = useState(0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contactError, setContactError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // TEMPORARY TEST HELPER — remove before go-live
  useEffect(() => {
    if (!window.location.search.includes('test=1')) return;
    const testAnswers = QUESTIONS.map(q => ({
      question_number: q.number,
      question_text: q.question,
      answer_text: [
        'I grew up in a mid-sized city, youngest of three. My parents ran a small business so I was always around the chaos of building something. I moved cities twice for work, got married, have two kids. Life has been full but lately it feels like I\'m running hard without knowing where I\'m going.',
        'I\'ve spent 15 years in B2B SaaS — started as a product manager, moved into VP roles, then left to co-found a startup that raised a seed round but didn\'t find product-market fit. I shut it down two years ago and joined a scale-up as Head of Product. Good money, good team, but something feels off.',
        'Three moments stand out. Leaving my first corporate job to join a tiny startup — everyone thought I was mad but it was the best decision I made. The co-founder falling out that nearly killed the startup — I rebuilt it alone and learned what I\'m actually made of. And shutting the company down — hardest thing I\'ve done, but I did it with integrity and people respected that.',
        'I come alive when I\'m building something from scratch or fixing something broken that others have given up on. Strategy sessions where I can connect dots across departments. Mentoring someone who suddenly gets it. I drain fast in bureaucratic environments, endless meetings with no decisions, and work that\'s purely execution without thinking.',
        'I keep ending up as the person who has to make sense of the mess. Whether it\'s a product roadmap, a team conflict, or a business model that isn\'t working — people bring me the hard problems. I also keep finding myself in organisations that are growing faster than their systems, which I find energising at first and exhausting eventually.',
        'My current role is well-defined and well-compensated but it\'s not mine. I\'m executing someone else\'s vision. I can see three things they\'re getting wrong and I\'ve said so, but the politics mean nothing changes. I feel like I\'m borrowing someone else\'s clothes.',
        'I\'ve started leaving meetings early in my head. My output is still high but my investment is low. I\'ve stopped suggesting ideas because the ROI on the conversation isn\'t worth it. My partner says I seem elsewhere. That\'s probably accurate.',
        'If I\'m honest, about three years. The startup shutdown hit hard but I thought joining a bigger company would reset things. It hasn\'t. I\'ve been managing the discomfort rather than addressing it.',
        'Stakeholder management where I have to move slowly for political reasons. Writing documents that will be read by no one. Performance reviews where I have to translate real feedback into corporate language. Anything that requires me to pretend I care about something I don\'t.',
        'Building the next thing. I have two ideas I\'ve been sitting on for 18 months. I keep saying I\'ll explore them when things settle down, but things don\'t settle down — I just keep adding more to the pile. I\'m also avoiding a direct conversation with my CEO about my actual role.',
        'Solving a genuinely hard problem with a small, sharp team. Whiteboard sessions that turn into something real. When someone I\'ve mentored ships something they\'re proud of. Reading and thinking — I protect Sunday mornings for this and it\'s the most alive I feel all week.',
        'About 18 months ago I led a full product strategy reset after an acquisition. I had real authority, a clear problem, and a team that trusted me. I worked longer hours than I do now but I didn\'t notice. That\'s probably the answer to everything.',
        'I would stop executing someone else\'s vision and start building my own. That\'s the honest answer. I know what I\'m good at, I know the problem I want to solve, and I keep waiting for permission that isn\'t coming.',
      ][q.number - 1],
    }));
    localStorage.setItem('zyrro_discovery_answers', JSON.stringify(testAnswers));
    setScreen('contact');
  }, []);

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

  useEffect(() => {
    if (screen !== 'generating') return;

    const data = QUESTIONS.map((q, i) => ({
      question_number: q.number,
      question_text: q.question,
      answer_text: answers[i] || '',
    }));
    localStorage.setItem('zyrro_discovery_answers', JSON.stringify(data));
    localStorage.setItem('zyrro_questionnaire_complete', 'true');

    const timers = [
      setTimeout(() => setGeneratingStep(1), 900),
      setTimeout(() => setGeneratingStep(2), 1900),
      setTimeout(() => setGeneratingStep(3), 3100),
      setTimeout(() => setGeneratingStep(4), 4300),
      setTimeout(() => setScreen('contact'), 5500),
    ];

    return () => timers.forEach(clearTimeout);
  }, [screen]);

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
      setScreen('generating');
    } else {
      setQuestionIndex(qi => qi + 1);
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setContactError('');
    setSubmitting(true);

    // 1. Create user account immediately
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: crypto.randomUUID(),
      options: {
        data: { display_name: name },
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    });

    if (signUpError || !signUpData.user) {
      setContactError(signUpError?.message ?? 'Sign up failed. Please try again.');
      setSubmitting(false);
      return;
    }

    const userId = signUpData.user.id;

    // 2. Read discovery answers from localStorage
    const stored = localStorage.getItem('zyrro_discovery_answers');
    let discoveryAnswers: Array<{ question_number: number; question_text: string; answer_text: string }> = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) discoveryAnswers = parsed;
      } catch {}
    }

    if (discoveryAnswers.length > 0) {
      // 3. API route handles profiles insert, discovery_answers insert, and generation
      fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, name, answers: discoveryAnswers }),
      });
    }

    // 5. Advance to check-email screen
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

  // ── GENERATING ─────────────────────────────────────────────────────
  if (screen === 'generating') {
    return (
      <div className="flow-container generating-container">
        <div className="spin spinner" />

        <div className="text-center-col">
          <h2>Building your report</h2>
          <p className="generating-desc">
            Zyrro is analysing your answers and detecting your identity patterns.
          </p>
        </div>

        <div className="generating-steps">
          {GENERATING_STEPS.map((step, i) => {
            const stepNum = i + 1;
            const isDone = generatingStep >= stepNum;
            const isCurrent = generatingStep === stepNum - 1;
            return (
              <div
                key={step}
                className="step-row"
                style={{
                  opacity: isDone || isCurrent ? 1 : 0.3,
                  transition: 'opacity 0.5s ease',
                }}
              >
                <div
                  className="step-indicator transition-bg"
                  style={{ background: isDone ? 'var(--gradient)' : 'rgba(0,0,0,0.06)' }}
                >
                  {isDone ? (
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path
                        d="M1 4.5L4 7.5L10 1"
                        stroke="white"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <div
                      className="step-dot transition-bg"
                      style={{ background: isCurrent ? 'var(--color-grad-2)' : 'var(--color-nav-inactive)' }}
                    />
                  )}
                </div>
                <span
                  className="step-label"
                  style={{
                    color: isDone ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    fontWeight: isDone ? 600 : 400,
                    transition: 'color 0.4s ease',
                  }}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── CONTACT COLLECTION ─────────────────────────────────────────────
  if (screen === 'contact') {
    return (
      <div className="flow-container">
        <div className="scroll-area" style={{ padding: '48px 24px 32px' }}>
          <p className="eyebrow">YOUR IDENTITY REPORT IS READY</p>

          <h1>Create your free account to see your report</h1>

          <p>Your Named Identity and full Signature Report are waiting.</p>

          <form onSubmit={handleContactSubmit} className="page-form" style={{ maxWidth: '100%' }}>
            <input
              className="form-input"
              type="text"
              placeholder="Your first name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />

            <input
              className="form-input"
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            {contactError && <p className="form-error">{contactError}</p>}

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Get my Identity Report'}
            </button>

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
        <div className="scroll-area" style={{ padding: '48px 24px 32px' }}>
          <p className="eyebrow">ONE MORE STEP</p>

          <h1>Check your inbox</h1>

          <p>We sent a confirmation link to {email}. Click it to access your report.</p>

          <p className="form-helper">Can&rsquo;t find it? Check your spam folder.</p>

          <button onClick={handleResend} className="btn-link">
            Resend the link
          </button>
        </div>
      </div>
    );
  }

  // ── INTRO ──────────────────────────────────────────────────────────
  if (screen === 'intro') {
    return (
      <div className="flow-container">
        <div className="scroll-area" style={{ padding: '48px 24px 32px' }}>
          <p className="eyebrow">IDENTITY SIGNATURE REPORT</p>

          <h1>Find out exactly how you&rsquo;re wired, and why it matters.</h1>

          <p>
            Answer 13 questions about your life and work. Zyrro detects the patterns and generates
            your personal Identity Signature Report.
          </p>

          <div className="deliverables-list">
            {DELIVERABLES.map(item => (
              <div key={item} className="flex-start-row" style={{ gap: '10px' }}>
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

          <button
            onClick={() => {
              setQuestionIndex(0);
              setScreen('question');
            }}
            className="btn-primary"
          >
            Begin
          </button>
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
        <div className="row-between" style={{ marginBottom: '7px' }}>
          <span className="label-micro">Question {questionIndex + 1} of 13</span>
          <span className="label-micro">{questionIndex + 1}/13</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="scroll-area" style={{ padding: '24px 24px 32px' }}>
        {/* Question header */}
        <div className="flex-start-row" style={{ gap: '14px' }}>
          <div className="question-number">
            {currentQuestion.number}
          </div>
          <div style={{ flex: 1 }}>
            <p className="question-text" style={{ margin: '0 0 5px' }}>
              {currentQuestion.question}
            </p>
            <p className="question-hint">
              {currentQuestion.hint}
            </p>
          </div>
        </div>

        {/* Answer card */}
        <div className="card card-answer">
          <textarea
            value={currentAnswer}
            onChange={e => updateAnswer(e.target.value)}
            placeholder="Type your answer here…"
            className="answer-textarea"
          />
          <div className="char-counter-row">
            <span
              className="char-counter"
              style={{ color: currentAnswer.length >= 900 ? 'var(--color-grad-2)' : '#BBBBBB' }}
            >
              {currentAnswer.length}/1000
            </span>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="row-between">
          <button onClick={handleBack} className="btn-back">
            <IconArrowLeft size={16} stroke={2} />
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className={`btn-secondary${canContinue ? '' : ' btn-disabled'}`}
          >
            {questionIndex === 12 ? 'Finish' : 'Continue'}
            <IconArrowRight size={16} stroke={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
