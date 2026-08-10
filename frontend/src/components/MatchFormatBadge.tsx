'use client';

import { getMatchFormatLabel } from '@/lib/competition';

type MatchFormatSource = {
  match_type?: string;
  name: string;
  competition_name?: string | null;
};

const FORMAT_STYLES: Record<string, string> = {
  TEST: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  ODI: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
  T20: 'border-violet-400/30 bg-violet-400/10 text-violet-100',
  T10: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100',
  'THE HUNDRED': 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  CRICKET: 'border-white/10 bg-white/[0.05] text-slate-200',
};

export function MatchFormatBadge({
  match,
  competitionName,
  className = '',
}: {
  match: MatchFormatSource;
  competitionName?: string | null;
  className?: string;
}) {
  const label = getMatchFormatLabel({
    ...match,
    competition_name: competitionName ?? match.competition_name ?? null,
  });
  const tone = FORMAT_STYLES[label] ?? FORMAT_STYLES.CRICKET;

  return (
    <span
      className={[
        'inline-flex shrink-0 min-w-[3.2rem] items-center justify-center rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]',
        tone,
        className,
      ].join(' ')}
      title={label}
      aria-label={label}
    >
      {label}
    </span>
  );
}
