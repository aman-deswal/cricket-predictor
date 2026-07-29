import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import './globals.css';

export const metadata: Metadata = {
  title: 'SixSense | AI Cricket Predictions',
  description: 'AI-powered cricket match predictions — your sixth sense for the game',
  metadataBase: new URL('https://aman-deswal.github.io'),
  openGraph: {
    title: 'SixSense | AI Cricket Predictions',
    description: 'AI-powered cricket match predictions with Edge Score analysis, sportsbook odds, and head-to-head breakdowns.',
    siteName: 'SixSense',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SixSense | AI Cricket Predictions',
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
    <html lang="en" className="dark">
      <body className="bg-[#111008] text-white min-h-screen antialiased flex flex-col">
        {/* Background gradient orbs — amber theme */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-500/8 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-yellow-600/8 rounded-full blur-3xl" />
        </div>

        <Navbar />
        <main className="relative flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          {children}
        </main>
        <footer className="relative border-t border-amber-800/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-gray-600">
              SixSense, Reserved 2026
            </p>
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-gray-700">v1.0</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
