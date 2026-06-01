'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  IconLayoutDashboard,
  IconShield,
  IconArrowFork,
  IconCalendar,
  IconCompass,
} from '@tabler/icons-react';
import { createClient } from '@/utils/supabase/client';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: IconLayoutDashboard },
  { label: 'Identity',  href: '/identity',  icon: IconShield },
  { label: 'Path',      href: '/path',      icon: IconArrowFork },
  { label: 'Plan',      href: '/plan',      icon: IconCalendar },
  { label: 'Mentor',    href: '/mentor',    icon: IconCompass },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(!!data?.user);
      setAuthChecked(true);
    });
  }, []);

  if (pathname === '/') return null;
  if (pathname === '/start' && (!authChecked || !isAuthenticated)) return null;

  return (
    <nav className="w-full flex-shrink-0 sticky bottom-0 z-50 bottom-nav">
      <div className="nav-inner">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <button
              key={item.href}
              onClick={() => { window.location.href = item.href; }}
              className="nav-btn"
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
