'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Match, Prediction } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';

interface MatchCardProps {
  match: Match;
  prediction: Prediction | null;
  index?: number;
}

/** Win/Loss dots — tight, readable, right-aligned */
function FormDots({ form, align = 'center' }: { form?: Array<'W' | 'L'>; align?: 'left' | 'center' | 'right' }) {
  if (!form || form.length === 0) return null;
  const recent = form.slice(-5);
  const alignClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';
  return (
    <div className={`flex ${alignClass} gap-[3px] mb-2`}>
      {recent.map((r, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.05 }}
          className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${r === 'W' ? 'bg-emerald-400' : 'bg-red-500/70'}`}
          title={r === 'W' ? 'Win' : 'Loss'}
        />
      ))}
    </div>
  );
}

/** Animated split probability bar */
function ProbBar({ team1Prob, c1, c2 }: { team1Prob: number; c1: string; c2: string }) {
  return (
    <div className="w-full h-[3px] bg-gray-800/60 rounded-full overflow-hidden flex">
      <motion.div
        className="h-full rounded-l-full"
        style={{ backgroundColor: c1 }}
        initial={{ width: 0 }}
        animate={{ width: `${team1Prob * 100}%` }}
        transition={{ duration: 0.9, ease: 'easeOut', delay: 0.25 }}
      />
      <motion.div
        className="h-full rounded-r-full"
        style={{ backgroundColor: c2 }}
        initial={{ width: 0 }}
        animate={{ width: `${(1 - team1Prob) * 100}%` }}
        transition={{ duration: 0.9, ease: 'easeOut', delay: 0.25 }}
      />
    </div>
  );
}

function getMatchTime(date: string): string {
  const raw = date.endsWith('Z') || date.includes('+') ? date : date + 'Z';
  const d = new Date(raw);
  const now = new Date();
  const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((matchDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function MatchCard({ match, prediction, index = 0 }: MatchCardProps) {
  const team1Meta = getTeamMeta(match.team1);
  const team2Meta = getTeamMeta(match.team2);
  const winner = prediction?.predicted_winner;

  return (
    <Link href={`/predict?id=${encodeURIComponent(match.match_id)}`} className="group relative block min-w-0 w-full max-w-full">
      <motion.div
        className="min-w-0 w-full max-w-full"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.08 }}
        whileHover={{ y: -5, scale: 1.015 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="absolute -inset-0.5 rounded-[20px] bg-gradient-to-r from-cricket-500/0 to-amber-500/0 blur-md transition-all duration-500 group-hover:from-cricket-500/15 group-hover:to-amber-500/15" />

        <div className="relative overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#18130a]/95 backdrop-blur-xl transition-all duration-300 group-hover:border-white/[0.13]">

          {/* Shimmer sweep on hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.025] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1200ms] pointer-events-none" />

          <div className="p-4">
            {/* ── Header row ── */}
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {/* Match type pill */}
                <span className="text-[9px] font-bold text-cricket-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-cricket-400/10 border border-cricket-400/15">
                  {match.match_type}
                </span>

              </div>

              {/* Time */}
              <span className="shrink-0 text-[10px] font-semibold tabular-nums text-gray-300">
                {getMatchTime(match.date)}
              </span>
            </div>

            {/* ── Teams ── */}
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">

              {/* Team 1 */}
              <div className="min-w-0 flex-1 text-center">
                <motion.div
                  className="w-11 h-11 mx-auto mb-2 rounded-full overflow-hidden ring-2 ring-offset-1 shadow-lg transition-all duration-300"
                  style={{
                    ['--tw-ring-color' as string]: winner === match.team1 ? team1Meta.primaryColor : 'rgba(75,85,99,0.3)',
                    ['--tw-ring-offset-color' as string]: '#18130a',
                  }}
                  whileHover={{ scale: 1.12 }}
                >
                  {team1Meta.countryCode ? (
                    <img src={getFlagUrl(team1Meta.countryCode, 48)} srcSet={`${getFlag2xUrl(team1Meta.countryCode, 48)} 2x`} alt={match.team1} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-black text-white text-[11px]" style={{ backgroundColor: team1Meta.primaryColor }}>
                      {team1Meta.shortName.slice(0, 3)}
                    </div>
                  )}
                </motion.div>
                <p className="truncate text-sm font-bold leading-tight text-white">{team1Meta.shortName}</p>
                <FormDots form={match.team1_recent_form} />
                {prediction && (
                  <motion.p
                    className={`text-sm font-black tabular-nums ${winner === match.team1 ? 'text-cricket-300' : 'text-gray-400'}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 }}
                  >
                    {(prediction.team1_win_probability * 100).toFixed(0)}%
                  </motion.p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-center gap-1.5">
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">vs</span>
              </div>

              {/* Team 2 */}
              <div className="min-w-0 flex-1 text-center">
                <motion.div
                  className="w-11 h-11 mx-auto mb-2 rounded-full overflow-hidden ring-2 ring-offset-1 shadow-lg transition-all duration-300"
                  style={{
                    ['--tw-ring-color' as string]: winner === match.team2 ? team2Meta.primaryColor : 'rgba(75,85,99,0.3)',
                    ['--tw-ring-offset-color' as string]: '#18130a',
                  }}
                  whileHover={{ scale: 1.12 }}
                >
                  {team2Meta.countryCode ? (
                    <img src={getFlagUrl(team2Meta.countryCode, 48)} srcSet={`${getFlag2xUrl(team2Meta.countryCode, 48)} 2x`} alt={match.team2} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-black text-white text-[11px]" style={{ backgroundColor: team2Meta.primaryColor }}>
                      {team2Meta.shortName.slice(0, 3)}
                    </div>
                  )}
                </motion.div>
                <p className="truncate text-sm font-bold leading-tight text-white">{team2Meta.shortName}</p>
                <FormDots form={match.team2_recent_form} />
                {prediction && (
                  <motion.p
                    className={`text-sm font-black tabular-nums ${winner === match.team2 ? 'text-cricket-300' : 'text-gray-400'}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 }}
                  >
                    {(prediction.team2_win_probability * 100).toFixed(0)}%
                  </motion.p>
                )}
              </div>
            </div>

            {/* Probability bar */}
            {prediction && (
              <ProbBar team1Prob={prediction.team1_win_probability} c1={team1Meta.primaryColor} c2={team2Meta.primaryColor} />
            )}

            <div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-t border-white/[0.05] pt-2.5">
              <p className="min-w-0 truncate text-[10px] text-gray-400">{match.venue || 'Venue TBD'}</p>
              <span className="shrink-0 text-[9px] font-semibold text-gray-300 transition-colors group-hover:text-amber-200">
                View match →
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
