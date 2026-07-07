import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data?.user) {
    redirect('/dashboard');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

      {/* HERO — self-contained gradient with nav */}
      <div className="hero-section">

        {/* Hero content */}
        <div className="hero-content">
          <h1 style={{ fontSize: 'clamp(30px, 6vw, 44px)', fontWeight: 700, color: '#fff', lineHeight: 1.15, margin: 0, letterSpacing: '-0.02em' }}>
            Successful. Empty. Stuck.
          </h1>
          <p style={{ fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 400, color: 'rgba(255,255,255,0.88)', lineHeight: 1.35, margin: 0, maxWidth: '480px' }}>
            Your story holds the answers.
          </p>
          <p style={{ fontSize: 'clamp(14px, 2.5vw, 16px)', fontWeight: 400, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, margin: 0, maxWidth: '440px' }}>
            In under 12 minutes, Zyrro finds the patterns in your life and shows you exactly who you are and what you are naturally meant to do next.
          </p>
          <Link href="/start" className="btn-cta">
            Discover Who You Are. It's Free.
          </Link>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            No credit card. No sign-up required to start.
          </p>
        </div>
      </div>

      {/* PROBLEM */}
      <section className="page-section">
      <div className="page-container">
        <h2 className="section-title">
          You've built a great life. So why doesn't it feel like enough?
        </h2>
        <p className="section-body" style={{ marginBottom: '20px' }}>
          You're accomplished. Experienced. Respected. And yet something feels hollow. The goals that once drove you no longer excite you. The life that looks right from the outside doesn't feel right on the inside.
        </p>
        <ul className="bullet-list">
          {[
            'You have everything and still feel something is missing',
            "The drive is there but you don't know where to point it",
            "You've outgrown the life you built but can't see what's next",
            "You can't explain it to others because you can barely explain it to yourself",
          ].map((item) => (
            <li key={item} className="bullet-item">
              <span className="bullet-dot" />
              {item}
            </li>
          ))}
        </ul>
        <p className="section-body">
          This isn't a crisis. It's a signal. Your patterns are pointing somewhere. You just need someone to show you where.
        </p>
      </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="page-section-alt">
        <div className="page-container">
          <h2 className="section-title" style={{ marginBottom: '32px', textAlign: 'center' }}>
            Simple. Structured. Surprisingly revealing.
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {[
              { n: '1', text: 'Answer 13 questions about your life and work' },
              { n: '2', text: 'Zyrro detects patterns across your answers' },
              { n: '3', text: 'Receive your Identity Signature, precise and personal' },
              { n: '4', text: 'Unlock your Paths, Plan and Mentor as you grow' },
            ].map((step) => (
              <div key={step.n} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div className="step-number">
                  {step.n}
                </div>
                <p style={{ color: '#1E1E1E', lineHeight: 1.6, margin: 0, paddingTop: '6px', fontSize: '16px' }}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section className="page-section">
        <div className="page-container">
          <h2 className="section-title" style={{ marginBottom: '8px', textAlign: 'center' }}>
            Four layers of insight. One clear direction.
          </h2>
          <p style={{ textAlign: 'center', marginBottom: '32px' }}>
            Each layer builds on the last, from self-knowledge to action.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { label: 'Identity', q: 'Who are you?', desc: 'Your named identity, signature patterns, and a precise picture of how you operate, based on your actual life story. Delivered in your first session.' },
              { label: 'Paths', q: 'Why are you here?', desc: 'A set of realistic directions forward, based on your patterns. Unlocked after your Identity report.' },
              { label: 'Plan', q: 'How do you get there?', desc: 'A structured plan from 7 days to 5 years, built around who you actually are. Unlocked alongside Paths.' },
              { label: 'Mentor', q: 'How do you stay on track?', desc: 'Access to your personal AI mentor, keeping you accountable, focused and moving forward. Available after your plan is set.' },
            ].map((item) => (
              <div key={item.label} className="card">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FE5618' }}>{item.label}</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#1E1E1E' }}>{item.q}</span>
                </div>
                <p style={{ fontSize: '14px' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="section-cta">
        <h2 style={{ fontSize: 'clamp(22px, 5vw, 32px)', color: '#fff', lineHeight: 1.25, margin: 0, maxWidth: '480px' }}>
          Your story holds the answers.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, margin: 0, maxWidth: '400px' }}>
          Zyrro finds them, in under 12 minutes. No sign-up required to start.
        </p>
        <Link href="/start" className="btn-cta">
          Start Now. It's Free.
        </Link>
      </section>

    </div>
  );
}