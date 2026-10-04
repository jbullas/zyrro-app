'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { useAuthUser } from '@/lib/use-auth-user';
import { IconLogin, IconMenu2, IconX } from '@tabler/icons-react';

type HeaderProps = {
  showLogin?: boolean;
};

// #154: the main nav moved here from the old BottomNav. Same items, hrefs,
// muted items, active rule and visibility rules — only the placement changed.
const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', muted: true },
  { label: 'Identity',  href: '/identity',  muted: false },
  { label: 'Path',      href: '/path',      muted: false },
  { label: 'Plan',      href: '/plan',      muted: true },
  { label: 'Mentor',    href: '/mentor',    muted: true },
];

const TAGLINE = 'Know Yourself. Create What’s Next.';

function computeInitials(user: User): string {
  const email = user.email ?? '';
  const meta = user.user_metadata;
  const name: string = meta?.full_name ?? meta?.name ?? email;
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function isActiveItem(pathname: string, href: string): boolean {
  // /start (logged in, States 2 & 3 — #20) has no nav item of its own; it's a
  // stage of the Identity flow, so it highlights that item.
  return pathname === href || pathname.startsWith(href + '/')
    || (href === '/identity' && pathname === '/start');
}

export default function Header({ showLogin = true }: HeaderProps) {
  const pathname = usePathname();
  const { user, loading } = useAuthUser();
  const userInitials = user ? computeInitials(user) : null;

  // Mirrors app/account/page.tsx's EditableField "Saved" pattern: a boolean
  // flipped true on the triggering tap, auto-reset after 2s.
  const [comingSoon, setComingSoon] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Visibility rules carried over from BottomNav: hidden on the homepage, and
  // on /start until auth is checked and the user is logged in.
  const showNav = pathname !== '/' && !(pathname === '/start' && (loading || !user));

  // Close the mobile menu on Escape (focus back to the menu button) and on a
  // click/tap outside it.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  function handleMutedTap() {
    setMenuOpen(false);
    setComingSoon(true);
    setTimeout(() => setComingSoon(false), 2000);
  }

  // Used by both the desktop nav row and the mobile menu panel (same
  // gradient surface, so the same .nav-btn styling works for both).
  function renderNavItems() {
    return NAV_ITEMS.map((item) => {
      const active = isActiveItem(pathname, item.href);
      const className = `nav-btn${active ? ' nav-btn--active' : ''}${item.muted ? ' nav-btn--muted' : ''}`;
      return item.muted ? (
        <button key={item.href} type="button" className={className} onClick={handleMutedTap}>
          {item.label}
        </button>
      ) : (
        <a
          key={item.href}
          href={item.href}
          className={className}
          aria-current={active ? 'page' : undefined}
          onClick={() => setMenuOpen(false)}
        >
          {item.label}
        </a>
      );
    });
  }

  return (
    <header className="w-full flex-shrink-0 sticky top-0 z-50 bg-gradient-brand">
      <div className="nav-bar">
        <a href="/" className="nav-brand">
          <img
            src="https://zyrro.ai/images/logo_300px.png"
            alt="Zyrro"
            className="nav-logo"
          />
          <span className="nav-tagline">{TAGLINE}</span>
        </a>
        <div className="nav-end">
          {showNav && (
            <>
              <nav className="nav-inner" aria-label="Main">
                {renderNavItems()}
              </nav>
              <button
                ref={menuButtonRef}
                type="button"
                className="icon-btn"
                aria-label={menuOpen ? 'Close menu' : 'Menu'}
                aria-expanded={menuOpen}
                aria-controls="main-nav-menu"
                onClick={() => setMenuOpen(open => !open)}
              >
                {menuOpen ? <IconX size={24} stroke={2} /> : <IconMenu2 size={24} stroke={2} />}
              </button>
            </>
          )}
          {userInitials ? (
            <a href="/account" aria-label="My account" className="nav-avatar">
              {userInitials}
            </a>
          ) : showLogin ? (
            <a
              href="/login"
              className="nav-icon-link"
              aria-label="Log in"
            >
              <IconLogin size={28} stroke={1.75} />
            </a>
          ) : null}
        </div>
      </div>
      {showNav && menuOpen && (
        <div ref={menuRef} id="main-nav-menu" className="nav-menu">
          <nav aria-label="Main">
            {renderNavItems()}
          </nav>
        </div>
      )}
      {comingSoon && <span className="nav-coming-soon" role="status">Coming soon</span>}
    </header>
  );
}
