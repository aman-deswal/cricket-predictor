'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Logo } from './Logo';
import { isMockDataEnabled } from '@/lib/supabase';
import { setStoredDemoMode } from '@/lib/demo-mode';

const NAV_LINKS = [
  { href: '/', label: 'Matches', icon: 'matches' },
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/history', label: 'History', icon: 'history' },
];

function NavIcon({ icon }: { icon: string }) {
  if (icon === 'dashboard') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="3" y="3" width="5" height="5" rx="1" />
        <rect x="12" y="3" width="5" height="5" rx="1" />
        <rect x="3" y="12" width="5" height="5" rx="1" />
        <rect x="12" y="12" width="5" height="5" rx="1" />
      </svg>
    );
  }

  if (icon === 'history') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M4.5 6.5A7 7 0 1 1 3 11" />
        <path d="M3 4v4h4M10 6.5V10l2.5 1.5" />
      </svg>
    );
  }

  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 5.5h12M4 10h12M4 14.5h8" />
      <circle cx="15" cy="14.5" r="1.5" />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname();
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
    <>
    <nav className="relative sticky top-0 z-50 border-b border-slate-700/35 bg-[#10151b]/95 shadow-lg shadow-black/10 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between sm:h-16">
          <Link href="/" className="group flex min-h-11 items-center space-x-2 sm:space-x-3">
            <div className="group-hover:scale-110 transition-transform">
              <span className="sm:hidden"><Logo size={40} /></span>
              <span className="hidden sm:inline"><Logo size={48} /></span>
            </div>
            <span
              className="text-xl tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900, letterSpacing: '-0.02em' }}
            >
              <span className="bg-gradient-to-r from-amber-600 via-amber-600 to-amber-700 bg-clip-text text-transparent">Six</span>
              <span className="text-white">Sense</span>
              <sup className="ml-0.5 align-super text-[0.4em] font-black text-amber-600">™</sup>
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleDemoMode}
            className={`ml-1 inline-flex min-h-9 items-center rounded-full border px-2.5 text-[9px] font-black uppercase tracking-[0.16em] transition-colors sm:hidden ${
              demoEnabled
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-slate-600/30 bg-white/[0.03] text-slate-500'
            }`}
            aria-pressed={demoEnabled}
            title="Toggle demo data"
          >
            Demo {demoEnabled ? 'on' : 'off'}
          </button>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center space-x-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`relative px-3 py-1.5 rounded-lg text-sm font-display transition-all ${
                  isActive(href)
                    ? 'text-white bg-white/5'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
                {isActive(href) && (
                  <motion.div
                    className="absolute -bottom-[13px] left-2 right-2 h-[2px] bg-amber-600 rounded-full"
                    layoutId="nav-underline"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </Link>
            ))}
            <button
              type="button"
              onClick={toggleDemoMode}
              className={`ml-2 inline-flex min-h-9 items-center rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
                demoEnabled
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
                  : 'border-slate-600/30 bg-white/[0.03] text-slate-500 hover:border-slate-500/50 hover:text-white'
              }`}
              title="Toggle demo data"
              aria-pressed={demoEnabled}
            >
              {demoEnabled ? 'Demo on' : 'Demo off'}
            </button>
          </div>

          <span className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 min-[430px]:inline sm:hidden">Match intelligence</span>
        </div>
      </div>
    </nav>
    <nav
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0c1117]/95 px-2 pt-1.5 shadow-[0_-10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:hidden"
      aria-label="Primary navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
        {NAV_LINKS.map(({ href, label, icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1 text-[10px] font-black transition-colors ${
                active ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 active:bg-white/[0.06] active:text-white'
              }`}
            >
              <NavIcon icon={icon} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}
