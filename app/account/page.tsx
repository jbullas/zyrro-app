'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function AccountPage() {
  const router = useRouter();
  const [loaded, setLoaded]               = useState(false);
  const [userId, setUserId]               = useState<string | null>(null);
  const [email, setEmail]                 = useState('');
  const [createdAt, setCreatedAt]         = useState('');
  const [name, setName]                   = useState('');
  const [nameInput, setNameInput]         = useState('');
  const [nameSaving, setNameSaving]       = useState(false);
  const [nameSaved, setNameSaved]         = useState(false);
  const [isPaid, setIsPaid]               = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? '');
      setCreatedAt(user.created_at ?? '');

      const meta = user.user_metadata;
      const displayName = meta?.full_name ?? meta?.display_name ?? meta?.name ?? user.email ?? '';
      setName(displayName);
      setNameInput(displayName);

      if (process.env.NEXT_PUBLIC_OPEN_ACCESS === 'true') {
        setIsPaid(true);
      } else {
        const { data: entitlement } = await supabase
          .from('entitlements')
          .select('id')
          .eq('user_id', user.id)
          .eq('product', 'onetime_payment')
          .eq('status', 'active')
          .maybeSingle();
        setIsPaid(!!entitlement);
      }

      setLoaded(true);
    }

    init();
  }, [router]);

  async function handleSaveName() {
    if (!userId || !nameInput.trim() || nameInput.trim() === name) return;
    const supabase = createClient();
    setNameSaving(true);
    const newName = nameInput.trim();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: newName, display_name: newName },
    });
    if (!error) {
      setName(newName);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
      // Best-effort: sync to profiles table (swallow RLS errors)
      supabase.from('profiles').update({ name: newName }).eq('user_id', userId).then(() => {});
    }
    setNameSaving(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
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

  if (!loaded) return null;

  return (
    <div className="flow-container">
      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>My Account</h1>

        {/* Profile */}
        <div className="card">
          <p className="eyebrow">PROFILE</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#6E6E6E', display: 'block', marginBottom: '6px' }}>
                Name
              </label>
              <input
                className="form-input"
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); setNameSaved(false); }}
                placeholder="Your name"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={handleSaveName}
                  className={`btn-primary${nameSaving || nameInput.trim() === name ? ' btn-disabled' : ''}`}
                  disabled={nameSaving || nameInput.trim() === name}
                  style={{ width: 'auto', padding: '10px 24px', fontSize: '14px' }}
                >
                  {nameSaving ? 'Saving…' : 'Save'}
                </button>
                {nameSaved && (
                  <span style={{ fontSize: '13px', color: '#6E6E6E' }}>Saved</span>
                )}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#6E6E6E', display: 'block', marginBottom: '4px' }}>
                Email
              </label>
              <p style={{ fontSize: '16px', margin: 0 }}>{email}</p>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="card">
          <p className="eyebrow">ACCOUNT</p>
          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#6E6E6E', display: 'block', marginBottom: '4px' }}>
              Member since
            </label>
            <p style={{ fontSize: '16px', margin: 0 }}>{createdAt ? formatDate(createdAt) : '—'}</p>
          </div>
        </div>

        {/* Plan & access */}
        <div className="card">
          <p className="eyebrow">PLAN &amp; ACCESS</p>
          <div style={{ marginTop: '12px' }}>
            {isPaid ? (
              <p style={{ fontSize: '16px', margin: 0 }}>
                <strong>Unlocked</strong> — Paths, Plan, Mentor
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '16px', margin: 0 }}>Free plan</p>
                <button
                  onClick={handleCheckout}
                  className={`btn-primary${checkoutLoading ? ' btn-disabled' : ''}`}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? 'Redirecting…' : 'Upgrade'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Log out */}
        <button
          onClick={handleLogout}
          className="btn-link"
          style={{ marginTop: '8px' }}
        >
          Log out
        </button>

      </div>
    </div>
  );
}
