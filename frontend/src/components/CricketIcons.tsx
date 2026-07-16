interface IconProps {
  className?: string;
}

/** Bat icon — angled cricket bat silhouette */
export function BatIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.5 18.5L2 22l1.5.5L7 19l-1.5-0.5zM14.5 3c-1.5 0-3 .8-4 2L6 11l1 1 2-1 3 3-1 2 1 1 6-4.5c1.2-1 2-2.5 2-4C20 5.5 17.5 3 14.5 3z" />
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
