'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';

const QUESTIONS: Array<{ n: number; text: string; hint: string | null }> = [
  {
    n: 1,
    text: 'In a few sentences, give me a quick snapshot of your personal life so far.',
    hint: 'Include whatever you think matters.',
  },
  {
    n: 2,
    text: 'Now, tell me more about your professional career.',
    hint: "Your current situation and the roles you've held.",
  },
  {
    n: 3,
    text: 'Looking back, what were the most important turning points or shifts in your life or career?',
    hint: null,
  },
  {
    n: 4,
    text: 'What were the things you enjoyed and what you disliked?',
    hint: null,
  },
  {
    n: 5,
    text: 'What patterns do you see?',
    hint: 'e.g. recurring situations, frustrations, environments, values',
  },
  {
    n: 6,
    text: 'What part of your life or work no longer fits and feels out of alignment?',
    hint: null,
  },
  {
    n: 7,
    text: 'What are the signs it is not sustainable?',
    hint: 'e.g. your behaviour, mood, motivation, or performance',
  },
  {
    n: 8,
    text: 'How long has this feeling been building up?',
    hint: null,
  },
  {
    n: 9,
    text: 'What tasks or situations feel hardest for you right now?',
    hint: null,
  },
  {
    n: 10,
    text: 'What are you avoiding or postponing because of this?',
    hint: null,
  },
  {
    n: 11,
    text: 'Amid the frustration, what still gives you energy or feels meaningful, even in small bursts?',
    hint: null,
  },
  {
    n: 12,
    text: 'When was the last time you felt confident and "in your lane"? What were you doing?',
    hint: null,
  },
  {
    n: 13,
    text: 'If you could change ONE thing in your current situation and it would create momentum, what would it be?',
    hint: null,
  },
];

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

type Screen = 'intro' | 'question' | 'generating';

export default function StartPage() {
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>('intro');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(13).fill(''));
  const [generatingStep, setGeneratingStep] = useState(0);

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
      question_number: q.n,
      question_text: q.text,
      answer_text: answers[i] || '',
    }));
    localStorage.setItem('zyrro_discovery_answers', JSON.stringify(data));
    localStorage.setItem('zyrro_questionnaire_complete', 'true');

    const timers = [
      setTimeout(() => setGeneratingStep(1), 900),
      setTimeout(() => setGeneratingStep(2), 1900),
      setTimeout(() => setGeneratingStep(3), 3100),
      setTimeout(() => setGeneratingStep(4), 4300),
      setTimeout(() => router.push('/identity'), 5500),
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
      question_number: q.n,
      question_text: q.text,
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
            {currentQuestion.n}
          </div>
          <div style={{ flex: 1 }}>
            <p
              className="question-text"
              style={{ margin: currentQuestion.hint ? '0 0 5px' : '0' }}
            >
              {currentQuestion.text}
            </p>
            {currentQuestion.hint && (
              <p className="question-hint">
                {currentQuestion.hint}
              </p>
            )}
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
