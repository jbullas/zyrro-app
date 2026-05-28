'use client';

import { usePathname } from 'next/navigation';
import {
  IconHome,
  IconShield,
  IconArrowFork,
  IconCalendar,
  IconMessages,
} from '@tabler/icons-react';

const NAV_ITEMS = [
  { label: 'Home',     href: '/dashboard', icon: IconHome },
  { label: 'Identity', href: '/identity',  icon: IconShield },
  { label: 'Paths',    href: '/paths',     icon: IconArrowFork },
  { label: 'Plan',     href: '/plan',      icon: IconCalendar },
  { label: 'Chat',     href: '/chat',      icon: IconMessages },
];

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname === '/') return null;

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
