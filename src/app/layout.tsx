import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SHAKENSTYLE Storage Portal',
  description: 'Client storage portal powered by SHAKENSTYLE and Rentman.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
