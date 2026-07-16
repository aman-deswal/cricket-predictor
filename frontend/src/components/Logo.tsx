export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-ball" x1="18" y1="14" x2="46" y2="50">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id="logo-shadow" cx="50%" cy="90%" r="40%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Floating shadow */}
      <ellipse cx="32" cy="56" rx="14" ry="3" fill="url(#logo-shadow)" />
      {/* The ball */}
      <circle cx="32" cy="30" r="20" fill="url(#logo-ball)" />
      {/* Seam */}
      <path d="M 16 24 Q 32 40, 48 24" stroke="#78350f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 16 36 Q 32 20, 48 36" stroke="#78350f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Stitches */}
      <line x1="18" y1="22" x2="21" y2="24" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="23" y1="19" x2="26" y2="21" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="29" y1="17" x2="32" y2="19" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="38" y1="19" x2="35" y2="17" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="43" y1="22" x2="40" y2="19" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
      {/* Highlight shine */}
      <ellipse cx="24" cy="20" rx="5" ry="3" fill="white" opacity="0.2" transform="rotate(-30 24 20)" />
    </svg>
  );
}
