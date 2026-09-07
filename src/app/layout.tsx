import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SHAKENSTYLE Portal',
  description: 'Klantportaal voor opgeslagen materialen van SHAKENSTYLE.',
  icons: {
    icon: 'https://www.shakenstyle.com/favicon.ico',
    shortcut: 'https://www.shakenstyle.com/favicon.ico',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
