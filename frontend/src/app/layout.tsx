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
      <body className="bg-[#0c0a09] text-white min-h-screen antialiased">
        {/* Background gradient orbs — amber theme */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-yellow-600/5 rounded-full blur-3xl" />
        </div>

        <Navbar />
        <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {children}
        </main>
        <footer className="relative border-t border-amber-800/20 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-gray-600">
              SixSense, Reserved 2026
            </p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/aman-deswal/cricket-predictor" target="_blank" rel="noreferrer" className="text-gray-600 hover:text-amber-400 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
              </a>
              <span className="text-[10px] text-gray-700">v1.0</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
