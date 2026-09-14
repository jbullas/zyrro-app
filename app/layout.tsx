import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { AuthUserProvider } from '@/lib/use-auth-user';

export const metadata: Metadata = {
  title: 'Zyrro',
  description: 'Discover your identity signature',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthUserProvider>
          <Header />
          <main className="app-main">
            {children}
          </main>
          <BottomNav />
        </AuthUserProvider>
      </body>
    </html>
  );
}