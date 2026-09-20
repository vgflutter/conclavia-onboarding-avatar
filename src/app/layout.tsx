import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Conclavia · Onboarding', description: 'Onboarding guidato, una conversazione alla volta.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="it"><body>{children}</body></html>;
}
