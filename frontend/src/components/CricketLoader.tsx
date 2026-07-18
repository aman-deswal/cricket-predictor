'use client';

import { motion } from 'framer-motion';

const BALL_SVG = (
  <>
    <defs>
      <linearGradient id="loader-ball" x1="18" y1="14" x2="46" y2="50">
        <stop offset="0%" stopColor="#fef3c7" />
        <stop offset="50%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="20" fill="url(#loader-ball)" />
    <path d="M 16 26 Q 32 42, 48 26" stroke="#78350f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M 16 38 Q 32 22, 48 38" stroke="#78350f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <line x1="18" y1="24" x2="21" y2="26" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="23" y1="21" x2="26" y2="23" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="38" y1="21" x2="35" y2="19" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="43" y1="24" x2="40" y2="21" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="24" cy="22" rx="5" ry="3" fill="white" opacity="0.2" transform="rotate(-30 24 22)" />
  </>
);

export function CricketLoader() {
  return (
    <div className="flex items-center justify-center h-64 overflow-hidden">
      <div className="relative w-48 h-48 flex items-center justify-center">
        {/* Ball flies toward viewer — starts small in centre, scales up, fades, resets */}
        <motion.div
          className="absolute"
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{
            scale: [0.3, 0.7, 1.6],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: [0.25, 0, 0.5, 1],
            times: [0, 0.4, 1],
          }}
        >
          <motion.svg
            width={64}
            height={64}
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            animate={{ rotate: [0, 540] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{ filter: 'drop-shadow(0 0 12px rgba(251, 191, 36, 0.4))' }}
          >
            {BALL_SVG}
          </motion.svg>
        </motion.div>

        {/* Loading text below */}
        <motion.p
          className="absolute -bottom-2 text-center text-[10px] text-gray-600 tracking-widest uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          Loading
        </motion.p>
      </div>
    </div>
  );
}
