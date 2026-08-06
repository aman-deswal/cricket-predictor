'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './Logo';
import { isMockDataEnabled } from '@/lib/supabase';
import { setStoredDemoMode } from '@/lib/demo-mode';

const NAV_LINKS = [
  { href: '/', label: 'Matches' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/history', label: 'History' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const toggleDemoMode = () => {
    const next = !demoEnabled;
    setStoredDemoMode(next);
    setDemoEnabled(next);
    window.location.reload();
  };

  useEffect(() => {
    setDemoEnabled(isMockDataEnabled());
  }, []);

  return (
    <nav className="relative border-b border-amber-800/30 bg-[#121010]/95 backdrop-blur-xl sticky top-0 z-50 shadow-lg shadow-amber-900/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center space-x-3 group" onClick={() => setMobileOpen(false)}>
            <div className="group-hover:scale-110 transition-transform">
              <Logo size={42} />
            </div>
            <span
              className="text-xl tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900, letterSpacing: '-0.02em' }}
            >
              <span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent">Six</span>
              <span className="text-white">Sense</span>
              <sup className="ml-0.5 align-super text-[0.4em] font-black text-amber-200">™</sup>
            </span>
            {demoEnabled && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Demo
              </span>
            )}
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center space-x-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`relative px-3 py-1.5 rounded-lg text-sm transition-all ${
                  isActive(href)
                    ? 'text-amber-300 bg-amber-500/10'
                    : 'text-gray-400 hover:text-amber-300 hover:bg-amber-500/5'
                }`}
              >
                {label}
                {isActive(href) && (
                  <motion.div
                    className="absolute -bottom-[13px] left-2 right-2 h-[2px] bg-amber-400 rounded-full"
                    layoutId="nav-underline"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </Link>
            ))}
            <button
              onClick={toggleDemoMode}
              className="ml-2 px-2 py-1 rounded text-[10px] uppercase tracking-[0.18em] text-gray-600 hover:text-amber-300 hover:bg-amber-500/5 opacity-40 hover:opacity-100 transition-all"
              title="Toggle demo data"
            >
              {demoEnabled ? 'Demo on' : 'Demo off'}
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-lg text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {mobileOpen ? (
                <>
                  <line x1="4" y1="4" x2="16" y2="16" />
                  <line x1="16" y1="4" x2="4" y2="16" />
                </>
              ) : (
                <>
                  <line x1="3" y1="5" x2="17" y2="5" />
                  <line x1="3" y1="10" x2="17" y2="10" />
                  <line x1="3" y1="15" x2="17" y2="15" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="sm:hidden border-t border-amber-800/20 bg-[#121010]/98 backdrop-blur-xl"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 py-3 space-y-1">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-sm transition-all ${
                    isActive(href)
                      ? 'text-amber-300 bg-amber-500/10 font-medium'
                      : 'text-gray-400 hover:text-amber-300 hover:bg-amber-500/5'
                  }`}
                >
                  {label}
                </Link>
              ))}
              <button
                onClick={toggleDemoMode}
                className="w-full text-left mt-2 px-3 py-2 rounded-lg text-xs uppercase tracking-[0.18em] text-gray-500 hover:text-amber-300 hover:bg-amber-500/5 opacity-70 transition-all"
              >
                {demoEnabled ? 'Demo mode: on' : 'Demo mode: off'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
