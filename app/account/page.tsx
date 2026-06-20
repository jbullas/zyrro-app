'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { IconPencil } from '@tabler/icons-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Reusable inline-edit row value ────────────────────────────────────────────
interface EditableFieldProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
}

function EditableField({ value, onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  function handleEdit() {
    setDraft(value);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(trimmed);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (_e) {
      // stay in editing mode on failure
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: '120px', width: 'auto' }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '5px 14px', fontSize: '13px', fontWeight: 600,
            background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.10)',
            borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: saving ? 0.4 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleCancel}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: '13px', color: '#6E6E6E', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span style={{ fontSize: '16px', overflowWrap: 'break-word', wordBreak: 'break-word', minWidth: 0, flex: 1 }}>
        {value || '—'}
      </span>
      {saved && (
        <span style={{ fontSize: '12px', color: '#6E6E6E', whiteSpace: 'nowrap' }}>Saved</span>
      )}
      <button
        onClick={handleEdit}
        aria-label="Edit name"
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: '#B0B0B0', display: 'flex', alignItems: 'center', flexShrink: 0,
        }}
      >
        <IconPencil size={14} stroke={1.75} />
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const ROW: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  gap: '12px',
  alignItems: 'start',
  padding: '14px 0',
};

const LABEL: React.CSSProperties = {
  fontSize: '14px',
  color: '#6E6E6E',
  fontWeight: 500,
  paddingTop: '2px',
};

const DIVIDER: React.CSSProperties = {
  borderBottom: '1px solid rgba(0,0,0,0.07)',
};

export default function AccountPage() {
  const router = useRouter();
  const [loaded, setLoaded]           = useState(false);
  const [userId, setUserId]           = useState<string | null>(null);
  const [email, setEmail]             = useState('');
  const [createdAt, setCreatedAt]     = useState('');
  const [name, setName]               = useState('');
  const [isPaid, setIsPaid]           = useState(false);
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

  async function handleSaveName(newName: string) {
    if (!userId) return;
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: newName, display_name: newName },
    });
    if (error) throw error;
    setName(newName);
    // Best-effort: sync to profiles table (swallow RLS errors)
    supabase.from('profiles').update({ name: newName }).eq('user_id', userId).then(() => {});
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

  const pageTitle = name ? `${name}'s Account` : 'Your Account';

  return (
    <div className="flow-container">
      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>{pageTitle}</h1>

        <div>
          {/* Name — editable */}
          <div style={{ ...ROW, ...DIVIDER }}>
            <span style={LABEL}>Name</span>
            <EditableField value={name} onSave={handleSaveName} />
          </div>

          {/* Email — read-only */}
          <div style={{ ...ROW, ...DIVIDER }}>
            <span style={LABEL}>Email</span>
            <span style={{ fontSize: '16px', overflowWrap: 'break-word', wordBreak: 'break-word', minWidth: 0 }}>
              {email}
            </span>
          </div>

          {/* Member since — read-only */}
          <div style={{ ...ROW, ...DIVIDER }}>
            <span style={LABEL}>Member since</span>
            <span style={{ fontSize: '16px' }}>{createdAt ? formatDate(createdAt) : '—'}</span>
          </div>

          {/* Plan */}
          <div style={ROW}>
            <span style={LABEL}>Plan</span>
            {isPaid ? (
              <span style={{ fontSize: '16px' }}>
                <strong>Unlocked</strong> — Paths, Plan, Mentor
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '16px' }}>Free plan</span>
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
        <button onClick={handleLogout} className="btn-link">
          Log out
        </button>

      </div>
    </div>
  );
}
