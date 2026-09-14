'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  IconLayoutDashboard,
  IconShield,
  IconArrowFork,
  IconCalendar,
  IconCompass,
} from '@tabler/icons-react';
import { useAuthUser } from '@/lib/use-auth-user';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: IconLayoutDashboard, muted: true },
  { label: 'Identity',  href: '/identity',  icon: IconShield,          muted: false },
  { label: 'Path',      href: '/path',      icon: IconArrowFork,       muted: false },
  { label: 'Plan',      href: '/plan',      icon: IconCalendar,        muted: true },
  { label: 'Mentor',    href: '/mentor',    icon: IconCompass,         muted: true },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user, loading } = useAuthUser();
  const isAuthenticated = !!user;
  const authChecked = !loading;

  // Mirrors app/account/page.tsx's EditableField "Saved" pattern: a boolean
  // flipped true on the triggering tap, auto-reset after 2s.
  const [comingSoon, setComingSoon] = useState(false);

  if (pathname === '/') return null;
  if (pathname === '/start' && (!authChecked || !isAuthenticated)) return null;

  function handleMutedTap() {
    setComingSoon(true);
    setTimeout(() => setComingSoon(false), 2000);
  }

  return (
    <nav className="w-full flex-shrink-0 sticky bottom-0 z-50 bottom-nav">
      {comingSoon && <span className="nav-coming-soon">Coming soon</span>}
      <div className="nav-inner">
        {NAV_ITEMS.map((item) => {
          // /start (logged in, States 2 & 3 — #20) has no NAV_ITEMS entry of its
          // own; it's a stage of the Identity flow, so it highlights that item.
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            || (item.href === '/identity' && pathname === '/start');
          const Icon = item.icon;

          return (
            <button
              key={item.href}
              onClick={item.muted ? handleMutedTap : () => { window.location.href = item.href; }}
              className={`nav-btn${item.muted ? ' nav-btn--muted' : ''}`}
            >
              {isActive && <span className="nav-active-bar" />}
              <Icon size={22} stroke={1.75} color="#1E1E1E" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
