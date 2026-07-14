import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cricket Predictor',
  description: 'AI-powered cricket match outcome predictions',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-cricket-950 text-white min-h-screen">
        <nav className="border-b border-cricket-800 bg-cricket-900/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <a href="/" className="flex items-center space-x-2">
                <span className="text-2xl">🏏</span>
                <span className="font-bold text-lg text-cricket-300">Cricket Predictor</span>
              </a>
              <div className="flex space-x-6">
                <a href="/" className="text-gray-300 hover:text-cricket-400 transition-colors">
                  Matches
                </a>
                <a href="/dashboard" className="text-gray-300 hover:text-cricket-400 transition-colors">
                  Dashboard
                </a>
                <a href="/history" className="text-gray-300 hover:text-cricket-400 transition-colors">
                  History
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
