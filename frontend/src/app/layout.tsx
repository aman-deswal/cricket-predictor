import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import './globals.css';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SixSense™ | AI Cricket Predictions',
  description: 'AI-powered cricket match predictions — your sixth sense for the game',
  metadataBase: new URL('https://aman-deswal.github.io'),
  openGraph: {
    title: 'SixSense™ | AI Cricket Predictions',
    description: 'AI-powered cricket match predictions with Edge Score analysis, sportsbook odds, and head-to-head breakdowns.',
    siteName: 'SixSense™',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SixSense™ | AI Cricket Predictions',
    description: 'AI-powered cricket match predictions — your sixth sense for the game',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#0e1116] text-white min-h-screen antialiased flex flex-col" style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
        {/* Background gradient orbs — muted and low-contrast */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-slate-500/8 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-cyan-500/6 rounded-full blur-3xl" />
        </div>

        <Navbar />
        <main className="relative flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          {children}
        </main>
        <footer className="relative border-t border-slate-700/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-center">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-600">
              SixSense<sup className="ml-0.5 text-[0.65em]">™</sup>, Reserved 2026
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
