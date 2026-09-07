import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SHAKENSTYLE Portal',
  description: 'Klantportaal voor opgeslagen materialen van SHAKENSTYLE.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
