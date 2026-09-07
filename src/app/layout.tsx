import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SHAKENSTYLE Portal',
  description: 'Klantportaal voor opgeslagen materialen van SHAKENSTYLE.',
  icons: {
    icon: '/shakenstyle-logo-dbe.png',
    shortcut: '/shakenstyle-logo-dbe.png',
    apple: '/shakenstyle-logo-dbe.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
