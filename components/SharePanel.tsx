'use client';

import { useEffect, useRef, useState } from 'react';
import { IDENTITY_REPORT_COPY as COPY } from '@/lib/identity-report-copy';

const SHARE = COPY.share;

// #7: the owner's share panel on /identity. Modal on desktop, bottom sheet
// under 700px (.dialog-overlay--sheet), built on the existing confirm-dialog
// classes. Opening it creates the link on first use (POST /api/share-link);
// "Stop sharing" revokes it (DELETE) and closes the panel.
export default function SharePanel({
  onClose,
  onLinkChange,
}: {
  onClose: () => void;
  onLinkChange: (url: string | null) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [stopping, setStopping] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    fetch('/api/share-link', { method: 'POST' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`share-link ${res.status}`))))
      .then(({ url }: { url: string }) => {
        if (cancelled) return;
        setUrl(url);
        onLinkChange(url);
      })
      .catch(err => {
        console.error('Share link failed:', err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [onLinkChange]);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleNativeShare() {
    if (!url) return;
    try {
      await navigator.share({ url });
    } catch {
      // Dismissed by the user: nothing to do.
    }
  }

  async function handleStop() {
    setStopping(true);
    const res = await fetch('/api/share-link', { method: 'DELETE' });
    setStopping(false);
    if (!res.ok) return;
    onLinkChange(null);
    onClose();
  }

  const encoded = url ? encodeURIComponent(url) : '';
  const platforms = [
    { label: SHARE.linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}` },
    { label: SHARE.x, href: `https://x.com/intent/post?url=${encoded}` },
    { label: SHARE.facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}` },
  ];

  return (
    <div
      className="dialog-overlay dialog-overlay--sheet"
      role="dialog"
      aria-modal="true"
      aria-label={SHARE.eyebrow}
      onClick={onClose}
    >
      <div className="dialog-card" onClick={e => e.stopPropagation()}>
        <div className="row-between">
          <p className="eyebrow">{SHARE.eyebrow}</p>
          <button ref={closeRef} type="button" className="btn-link btn-link-inline" onClick={onClose}>
            {SHARE.close}
          </button>
        </div>
        <p>{SHARE.body}</p>

        {!url && !failed && (
          <div className="flex items-center gap-12">
            <div className="spin spinner" />
            <p className="documentation">{SHARE.loading}</p>
          </div>
        )}
        {failed && <p className="documentation">{SHARE.error}</p>}

        {url && (
          <>
            <div className="flex items-center gap-8">
              <input className="input-field" type="text" readOnly value={url} aria-label="Share link" onFocus={e => e.target.select()} />
              <button type="button" className="btn-secondary btn-secondary-compact" onClick={handleCopy}>
                {copied ? SHARE.copied : SHARE.copy}
              </button>
            </div>
            <div className="flex flex-wrap gap-8">
              {platforms.map(p => (
                <a
                  key={p.label}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary btn-secondary-compact"
                >
                  {p.label}
                </a>
              ))}
              {canNativeShare && (
                <button type="button" className="btn-secondary btn-secondary-compact" onClick={handleNativeShare}>
                  {SHARE.nativeShare}
                </button>
              )}
            </div>
            <button
              type="button"
              className={`btn-link${stopping ? ' btn-disabled' : ''}`}
              onClick={handleStop}
              disabled={stopping}
            >
              {SHARE.stop}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
