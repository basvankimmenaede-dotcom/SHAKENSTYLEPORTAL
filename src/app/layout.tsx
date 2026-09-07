import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SHAKENSTYLE Portal',
  description: 'Klantportaal voor opgeslagen materialen van SHAKENSTYLE.',
  icons: {
    icon: '/shakenstyle-logo-site.png',
    shortcut: '/shakenstyle-logo-site.png',
    apple: '/shakenstyle-logo-site.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
