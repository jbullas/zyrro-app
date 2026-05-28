'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { IconLogin } from '@tabler/icons-react';

type HeaderProps = {
  showLogin?: boolean;
};

export default function Header({ showLogin = true }: HeaderProps) {
  const [userInitials, setUserInitials] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const email = data.user.email ?? '';
        const meta = data.user.user_metadata;
        const name: string = meta?.full_name ?? meta?.name ?? email;
        const parts = name.trim().split(' ');
        const initials = parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase();
        setUserInitials(initials);
      }
    });
  }, []);

  if (pathname === '/') return null;

  return (
    <header className="w-full flex-shrink-0 sticky top-0 z-50 bg-gradient-brand">
      <div className="nav-spacer" />
      <div className="nav-bar" style={{ padding: '8px 16px 14px' }}>
        <div />
        <div className="nav-center">
          <a href="/" className="nav-center">
            <img
              src="https://zyrro.ai/images/logo_300px.png"
              alt="Zyrro"
              className="nav-logo"
            />
          </a>
        </div>
        <div className="nav-end">
          {userInitials ? (
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: '#3d0063',
                border: '1.5px solid rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {userInitials}
            </div>
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
    </header>
  );
}