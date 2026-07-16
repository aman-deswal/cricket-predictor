import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import './globals.css';

export const metadata: Metadata = {
  title: 'SixSense | AI Cricket Predictions',
  description: 'AI-powered cricket match predictions — your sixth sense for the game',
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

        <nav className="relative border-b border-amber-900/20 bg-[#0c0a09]/90 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center space-x-3 group">
                <div className="group-hover:scale-110 transition-transform">
                  <Logo size={42} />
                </div>
                <span className="text-xl tracking-tight bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900, letterSpacing: '-0.02em' }}>
                  SixSense
                </span>
              </Link>
              <div className="flex items-center space-x-1">
                <Link href="/" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-amber-300 hover:bg-amber-500/5 transition-all">
                  Matches
                </Link>
                <Link href="/dashboard" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-amber-300 hover:bg-amber-500/5 transition-all">
                  Dashboard
                </Link>
                <Link href="/history" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-amber-300 hover:bg-amber-500/5 transition-all">
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
