import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cricket Predictor | AI-Powered Match Predictions',
  description: 'AI-powered cricket match outcome predictions using GPT-4o',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0f0d] text-white min-h-screen antialiased">
        {/* Background gradient orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-cricket-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />
        </div>

        <nav className="relative border-b border-white/5 bg-[#0a0f0d]/80 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center space-x-2.5 group">
                <div className="group-hover:scale-110 transition-transform">
                  <Logo size={36} />
                </div>
                <span className="font-black text-lg bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent">
                  CricPredict
                </span>
              </Link>
              <div className="flex items-center space-x-1">
                <Link href="/" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                  Matches
                </Link>
                <Link href="/dashboard" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                  Dashboard
                </Link>
                <Link href="/history" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                  History
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
