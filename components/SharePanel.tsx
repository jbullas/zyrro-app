'use client';

import { useEffect, useRef, useState } from 'react';
import {
  IconBrandFacebook, IconBrandLinkedin, IconBrandX, IconCheck, IconCopy, IconShare, IconX,
} from '@tabler/icons-react';
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
    { label: SHARE.linkedin, Icon: IconBrandLinkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}` },
    { label: SHARE.x, Icon: IconBrandX, href: `https://x.com/intent/post?url=${encoded}` },
    { label: SHARE.facebook, Icon: IconBrandFacebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}` },
  ];

  return (
    <div
      className="dialog-overlay dialog-overlay--sheet"
      role="dialog"
      aria-modal="true"
      aria-label={SHARE.eyebrow}
      onClick={onClose}
    >
      <div className="dialog-card dialog-card--share" onClick={e => e.stopPropagation()}>
        <div className="row-between">
          <p className="eyebrow">{SHARE.eyebrow}</p>
          <button ref={closeRef} type="button" className="icon-btn -my-[12px] -mr-[12px]" aria-label={SHARE.close} onClick={onClose}>
            <IconX size={20} stroke={2} aria-hidden="true" />
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
            {/* The link is the panel's main element: its own line, extra space around it. */}
            <div className="panel flex items-center gap-8 my-[8px]">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 truncate font-semibold text-[var(--color-grad-2)]"
              >
                {url}
              </a>
              <button
                type="button"
                className="icon-btn -my-[12px] -mr-[8px]"
                aria-label={copied ? SHARE.copied : SHARE.copy}
                onClick={handleCopy}
              >
                {copied
                  ? <IconCheck size={20} stroke={2} aria-hidden="true" />
                  : <IconCopy size={20} stroke={2} aria-hidden="true" />}
              </button>
            </div>

            {/* Native share sheet: phones only (under 700px), above the platforms. */}
            {canNativeShare && (
              <div className="hidden max-[700px]:block">
                <button type="button" className="btn-secondary btn-secondary-compact w-full justify-center" onClick={handleNativeShare}>
                  <IconShare size={18} stroke={2} aria-hidden="true" />
                  {SHARE.nativeShare}
                </button>
              </div>
            )}

            {/* Three equal columns; stacked full width under 700px. */}
            <div className="grid grid-cols-3 max-[700px]:grid-cols-1 gap-8">
              {platforms.map(({ label, Icon, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary btn-secondary-compact w-full justify-center"
                >
                  <Icon size={18} stroke={2} aria-hidden="true" />
                  {label}
                </a>
              ))}
            </div>

            <button
              type="button"
              className={`documentation self-center underline cursor-pointer${stopping ? ' btn-disabled' : ''}`}
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
