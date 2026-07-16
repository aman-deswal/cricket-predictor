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
