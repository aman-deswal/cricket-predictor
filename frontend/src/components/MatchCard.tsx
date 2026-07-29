'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Match, Prediction } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';

interface MatchCardProps {
  match: Match;
  prediction: Prediction | null;
  index?: number;
  hot?: boolean;
}

function getMatchDescriptor(match: Match): string {
  if (match.name?.includes(',')) {
    return match.name.split(',').slice(1).join(',').trim();
  }
  return match.name || match.venue;
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

function toAmericanOdds(p: number): string {
  if (p <= 0 || p >= 1) return '-';
  if (p >= 0.5) return Math.round(-100 * p / (1 - p)).toString();
  return '+' + Math.round(100 * (1 - p) / p).toString();
}

function decimalToAmerican(d: number): string {
  if (d <= 1) return '-';
  if (d >= 2) return '+' + Math.round((d - 1) * 100).toString();
  return Math.round(-100 / (d - 1)).toString();
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

/** AI Edge badge — compact, always shows the value (positive) side */
function AIEdgeBadge({ valueTeamName, edgePct, aiPct, impliedPct }: {
  valueTeamName: string;
  edgePct: number;   // always positive
  aiPct: number;
  impliedPct: number;
}) {
  const tooltip = `${valueTeamName}: AI says ${aiPct}% win chance, bookmaker implies ${impliedPct}%. Our model sees +${edgePct}% extra value here.`;

  return (
    <motion.div
      className="relative flex items-center"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, delay: 0.5 }}
      title={tooltip}
    >
      <span className="absolute inset-0 rounded-full animate-ev-ping bg-emerald-400/25" />
      <span className="relative flex items-center gap-0.5 px-1.5 py-[3px] rounded-full text-[9px] font-bold border cursor-help bg-emerald-500/15 border-emerald-400/35 text-emerald-300">
        <svg className="w-[7px] h-[7px]" viewBox="0 0 8 8" fill="currentColor">
          <path d="M4 1L7 4H5v3H3V4H1L4 1z" />
        </svg>
        +{edgePct}%
      </span>
    </motion.div>
  );
}

export function MatchCard({ match, prediction, index = 0, hot = false }: MatchCardProps) {
  const team1Meta = getTeamMeta(match.team1);
  const team2Meta = getTeamMeta(match.team2);
  const winner = prediction?.predicted_winner;

  // EV calculations
  const aiProb1 = prediction?.team1_win_probability ?? null;
  const aiProb2 = prediction?.team2_win_probability ?? null;
  const odds1 = match.bookmaker_odds?.team1_odds ?? null;
  const odds2 = match.bookmaker_odds?.team2_odds ?? null;

  // Who has the EV edge (pick the bigger one to feature)
  const ev1Pct = aiProb1 && odds1 ? Math.round((aiProb1 - 1 / odds1) * 100) : 0;
  const ev2Pct = aiProb2 && odds2 ? Math.round((aiProb2 - 1 / odds2) * 100) : 0;

  // Confidence colour
  const confidenceColor =
    prediction?.confidence === 'high'   ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' :
    prediction?.confidence === 'medium' ? 'text-amber-300   bg-amber-500/15   border-amber-500/30'   :
                                          'text-red-300     bg-red-500/15     border-red-500/30';

  return (
    <Link href={`/predict?id=${encodeURIComponent(match.match_id)}`} className="block relative group">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.08 }}
        whileHover={{ y: -5, scale: 1.015 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Ambient glow — cinematic for hot, subtle hover for rest */}
        <div className={`absolute -inset-0.5 rounded-[20px] blur-md transition-all duration-500 ${
          hot
            ? 'bg-gradient-to-br from-orange-500/40 via-amber-400/30 to-red-500/25 animate-pulse-slow'
            : 'bg-gradient-to-r from-cricket-500/0 to-amber-500/0 group-hover:from-cricket-500/15 group-hover:to-amber-500/15'
        }`} />

        <div className={`relative bg-[#18130a]/95 backdrop-blur-xl rounded-[18px] border overflow-hidden transition-all duration-300 ${
          hot
            ? 'border-amber-500/50 shadow-lg shadow-amber-900/30'
            : 'border-white/[0.07] group-hover:border-white/[0.13]'
        }`}>

          {/* Top accent line */}
          {hot && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 via-amber-400 to-red-500" />
          )}

          {/* Shimmer sweep on hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.025] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1200ms] pointer-events-none" />

          <div className="p-4">
            {/* ── Header row ── */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                {/* Match type pill */}
                <span className="text-[9px] font-bold text-cricket-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-cricket-400/10 border border-cricket-400/15">
                  {match.match_type}
                </span>

                {/* HOT badge — only on non-hero cards (hero already calls this out as Best Bet) */}
                {hot && (
                  <motion.span
                    className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500/25 to-red-500/25 border border-orange-500/40 text-[9px] font-black uppercase tracking-widest text-orange-300"
                    animate={{ opacity: [1, 0.75, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    🔥 Best Bet
                  </motion.span>
                )}
              </div>

              {/* Time */}
              <span className="text-[10px] text-gray-500 font-medium tabular-nums">
                {getMatchTime(match.date)}
              </span>
            </div>

            {/* ── Teams ── */}
            <div className="flex items-center justify-between gap-2 mb-3">

              {/* Team 1 */}
              <div className="flex-1 text-center">
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
                <p className="font-bold text-white text-sm leading-tight">{team1Meta.shortName}</p>
                <FormDots form={match.team1_recent_form} />
                {prediction && (
                  <motion.p
                    className={`text-sm font-black tabular-nums ${winner === match.team1 ? 'text-cricket-300' : 'text-gray-600'}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 }}
                  >
                    {(prediction.team1_win_probability * 100).toFixed(0)}%
                  </motion.p>
                )}
              </div>

              {/* VS + AI Edge signal — always shows the value (positive) side */}
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest">vs</span>
                {prediction && odds1 && odds2 && (() => {
                  // Always pick whichever team has POSITIVE edge (AI > market)
                  // If ev1 > 0 → Team 1 is underpriced; if ev2 > 0 → Team 2 is underpriced
                  // Mathematically one will be positive and one negative (roughly), so prefer positive
                  const valueIsT1 = ev1Pct >= ev2Pct && ev1Pct >= 7;
                  const valueIsT2 = !valueIsT1 && ev2Pct >= 7;
                  if (!valueIsT1 && !valueIsT2) return null;
                  const edgePct = valueIsT1 ? ev1Pct : ev2Pct;
                  const aiProb  = valueIsT1 ? aiProb1! : aiProb2!;
                  const bOdds   = valueIsT1 ? odds1 : odds2;
                  const vTeam   = valueIsT1 ? team1Meta.shortName : team2Meta.shortName;
                  return (
                    <AIEdgeBadge
                      valueTeamName={vTeam}
                      edgePct={edgePct}
                      aiPct={Math.round(aiProb * 100)}
                      impliedPct={Math.round((1 / bOdds) * 100)}
                    />
                  );
                })()}
              </div>

              {/* Team 2 */}
              <div className="flex-1 text-center">
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
                <p className="font-bold text-white text-sm leading-tight">{team2Meta.shortName}</p>
                <FormDots form={match.team2_recent_form} />
                {prediction && (
                  <motion.p
                    className={`text-sm font-black tabular-nums ${winner === match.team2 ? 'text-cricket-300' : 'text-gray-600'}`}
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

            {/* ── Footer: series name + odds ── */}
            <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
              <p className="text-[9px] text-gray-600 truncate mb-2">{getMatchDescriptor(match)}</p>

              {(match.bookmaker_odds || prediction) && (
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-700 uppercase tracking-widest font-semibold">Odds</span>
                  <div className="flex items-center gap-2">
                    {/* Team 1 odds */}
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] text-gray-600 mb-0.5">{team1Meta.shortName}</span>
                      <span className={`text-[11px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded bg-white/[0.04] border ${
                        ev1Pct >= 7 ? 'text-emerald-300 border-emerald-500/30' : ev1Pct <= -7 ? 'text-red-400 border-red-500/20' : 'text-gray-300 border-white/[0.06]'
                      }`}>
                        {match.bookmaker_odds ? decimalToAmerican(match.bookmaker_odds.team1_odds) : prediction ? toAmericanOdds(prediction.team1_win_probability) : '-'}
                      </span>
                    </div>
                    <span className="text-gray-800 text-[10px]">·</span>
                    {/* Team 2 odds */}
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] text-gray-600 mb-0.5">{team2Meta.shortName}</span>
                      <span className={`text-[11px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded bg-white/[0.04] border ${
                        ev2Pct >= 7 ? 'text-emerald-300 border-emerald-500/30' : ev2Pct <= -7 ? 'text-red-400 border-red-500/20' : 'text-gray-300 border-white/[0.06]'
                      }`}>
                        {match.bookmaker_odds ? decimalToAmerican(match.bookmaker_odds.team2_odds) : prediction ? toAmericanOdds(prediction.team2_win_probability) : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
