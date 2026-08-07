'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import Link from 'next/link';
import { MatchWithPredictions, Prediction } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, isInternationalTeam } from '@/lib/teams';

interface MatchCardProps {
  match: MatchWithPredictions;
  prediction: Prediction | null;
  index?: number;
}

function TeamCrest({
  team,
  logoUrl,
  selected,
}: {
  team: string;
  logoUrl?: string;
  selected: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const meta = getTeamMeta(team);
  const isInternational = isInternationalTeam(team);
  const imageUrl = imageFailed
    ? ''
    : logoUrl || (isInternational && meta.countryCode ? getFlagUrl(meta.countryCode, 64) : '');

  return (
    <motion.div
      className="mx-auto mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border bg-slate-950/30 p-1.5 shadow-lg"
      style={{
        borderColor: selected ? `${meta.primaryColor}aa` : 'rgba(255,255,255,0.09)',
        boxShadow: selected ? `0 0 18px ${meta.primaryColor}30` : undefined,
      }}
      whileHover={{ scale: 1.08 }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={team}
          className={`h-full w-full ${
            isInternational ? 'rounded-lg object-cover' : 'object-contain'
          }`}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-xl text-[10px] font-black text-white"
          style={{ background: `linear-gradient(145deg, ${meta.primaryColor}, ${meta.secondaryColor})` }}
        >
          {meta.shortName.slice(0, 3)}
        </span>
      )}
    </motion.div>
  );
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
        <div className="absolute -inset-0.5 rounded-[20px] bg-gradient-to-r from-slate-400/0 via-amber-200/0 to-cyan-400/0 blur-md transition-all duration-500 group-hover:from-slate-400/12 group-hover:via-amber-200/8 group-hover:to-cyan-400/12" />

        <div className="relative overflow-hidden rounded-[18px] border border-slate-700/45 bg-[#131922]/95 backdrop-blur-xl transition-all duration-300 group-hover:border-slate-500/55">

          {/* Shimmer sweep on hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.025] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1200ms] pointer-events-none" />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 opacity-[0.07]"
            style={{ background: `radial-gradient(circle at 20% 45%, ${team1Meta.primaryColor}, transparent 65%)` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-[0.07]"
            style={{ background: `radial-gradient(circle at 80% 45%, ${team2Meta.primaryColor}, transparent 65%)` }}
          />

          <div className="relative p-4">
            {/* ── Header row ── */}
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {/* Match type pill */}
                <span className="text-[9px] font-bold text-slate-200 uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
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
                <TeamCrest team={match.team1} logoUrl={match.team1_logo_url} selected={winner === match.team1} />
                <p className="truncate text-base font-black leading-tight text-white">{team1Meta.shortName}</p>
                <p className="mt-0.5 truncate text-[8px] font-semibold text-gray-500">{team1Meta.name}</p>
                <FormDots form={match.team1_recent_form} />
                {prediction && (
                  <motion.p
                    className={`text-sm font-black tabular-nums ${winner === match.team1 ? 'text-amber-100' : 'text-gray-400'}`}
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
                <TeamCrest team={match.team2} logoUrl={match.team2_logo_url} selected={winner === match.team2} />
                <p className="truncate text-base font-black leading-tight text-white">{team2Meta.shortName}</p>
                <p className="mt-0.5 truncate text-[8px] font-semibold text-gray-500">{team2Meta.name}</p>
                <FormDots form={match.team2_recent_form} />
                {prediction && (
                  <motion.p
                    className={`text-sm font-black tabular-nums ${winner === match.team2 ? 'text-amber-100' : 'text-gray-400'}`}
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
              <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-amber-100 transition-colors group-hover:text-white">
                Match preview →
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
