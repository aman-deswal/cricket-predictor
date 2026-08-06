interface IconProps {
  className?: string;
}

/** Bat icon — batsman silhouette in playing stance */
export function BatIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.5 2.5l1.2 1.2-4.5 4.5-1.5 1c-.3.2-.5.5-.5.8v1.5L7 14.7l-.7-.7-1.4 1.4L7 17.5l1.4-1.4-.7-.7 3.2-3.2h1.5c.3 0 .7-.2.8-.5l1-1.5 4.5-4.5 1.2 1.2 1.4-1.4-3-3-1.4 1.4zM5.5 18l-2 2c-.4.4-.4 1 0 1.4.4.4 1 .4 1.4 0l2-2c.4-.4.4-1 0-1.4-.4-.4-1-.4-1.4 0z" />
    </svg>
  );
}

/** Bowl icon — cricket ball with seam */
export function BowlIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M8 6c2 3 2 9 0 12" strokeLinecap="round" />
      <path d="M16 6c-2 3-2 9 0 12" strokeLinecap="round" />
    </svg>
  );
}

/** Wicket keeper — gloves icon */
export function KeeperIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 13V8a5 5 0 0110 0v5" strokeLinecap="round" />
      <path d="M5 13h14v3a4 4 0 01-4 4H9a4 4 0 01-4-4v-3z" />
      <line x1="9" y1="13" x2="9" y2="17" />
      <line x1="15" y1="13" x2="15" y2="17" />
    </svg>
  );
}

/** All-rounder — combined bat + ball */
export function AllRounderIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="16" cy="8" r="4" />
      <path d="M3 21l3-3m0 0l6-10 3 3-10 6z" fill="currentColor" opacity="0.3" />
      <path d="M3 21l3-3m0 0l6-10 3 3-10 6z" />
    </svg>
  );
}

/** Captain badge — star */
export function CaptainIcon({ className = 'w-3 h-3' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1l2.2 4.5L15 6.3l-3.5 3.4.8 4.8L8 12.3 3.7 14.5l.8-4.8L1 6.3l4.8-.8z" />
    </svg>
  );
}

/** Globe — international matches */
export function GlobeIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c-2.5 4-2.5 14 0 18M12 3c2.5 4 2.5 14 0 18" strokeLinecap="round" />
      <path d="M3.5 8.5h17M3.5 15.5h17" strokeLinecap="round" />
    </svg>
  );
}

/** Globe and batter — matches from around the cricket world */
export function GroundsIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g opacity="0.55" strokeWidth="1.35">
        <circle cx="10.5" cy="12" r="8.5" />
        <path d="M10.5 3.5c-2.4 3.8-2.4 13.2 0 17M3 9h12.2M2.4 14.8h9.2" />
      </g>
      <g strokeWidth="1.75">
        <circle cx="15.4" cy="7.2" r="1.45" fill="currentColor" stroke="none" />
        <path d="M14.7 9.3l-2 3.1 2.7 2.2-1.1 4.2M13.8 10.6l3.1 2 2-3.2M15.4 14.6l2.8 3.8" />
        <path d="M19 9.6l2.4-5.8" strokeWidth="2.3" />
      </g>
    </svg>
  );
}

/** Shield — league / domestic cricket */
export function ShieldIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M12 2l8 3v6c0 5.3-4 9.4-8 11-4-1.6-8-5.7-8-11V5l8-3z" />
    </svg>
  );
}

/** Trophy — match winner */
export function TrophyIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h10v8a5 5 0 01-10 0V3z" />
      <path d="M5 5H3v4a4 4 0 004 4M19 5h2v4a4 4 0 01-4 4" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/** Sparkle / AI pick indicator */
export function SparkleIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 5.4L19.2 9l-5.4 1.8L12 16.2l-1.8-5.4L4.8 9l5.4-1.8L12 2z" />
      <path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9L5 17z" opacity="0.6" />
    </svg>
  );
}

/** Target — accuracy metric */
export function TargetIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Bar chart — brier / stats */
export function BarChartIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="14" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="12" rx="1" />
      <rect x="16" y="4" width="4" height="17" rx="1" />
    </svg>
  );
}

/** Chevron down — expand/collapse */
export function ChevronDownIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Coin / toss insight */
export function CoinIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
