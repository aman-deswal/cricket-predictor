'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { MatchFormatBadge } from '@/components/MatchFormatBadge';
import { buildScorecardSummaries, type LedgerEntry } from '@/lib/ledger';
import { getFranchiseLogoUrl } from '@/lib/franchise-logos';
import { getFlagUrl, getTeamMeta, isInternationalTeam } from '@/lib/teams';

function TeamMark({
  team,
  selected,
}: {
  team: string;
  selected: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const meta = getTeamMeta(team);
  const isInternational = isInternationalTeam(team);
  const imageUrl = imageFailed
    ? ''
    : getFranchiseLogoUrl(team) || (isInternational && meta.countryCode ? getFlagUrl(meta.countryCode, 48) : '');

  return (
    <div
      className="mx-auto mb-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border bg-slate-950/35 p-1.5 shadow-lg"
      style={{
        borderColor: selected ? `${meta.primaryColor}88` : 'rgba(255,255,255,0.08)',
        boxShadow: selected ? `0 0 18px ${meta.primaryColor}22` : undefined,
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={team}
          className={`h-full w-full ${isInternational ? 'rounded-lg object-cover' : 'object-contain'}`}
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
    </div>
  );
}

function getMarketGap(entry: LedgerEntry): { team: string; gap: number } | null {
  if (!entry.bookmaker_odds) return null;
  if (!Number.isFinite(entry.bookmaker_odds.team1_odds) || !Number.isFinite(entry.bookmaker_odds.team2_odds)) return null;
  if (entry.bookmaker_odds.team1_odds <= 1 || entry.bookmaker_odds.team2_odds <= 1) return null;
  if (entry.team1_win_probability === undefined || entry.team2_win_probability === undefined) return null;

  const implied1 = 1 / entry.bookmaker_odds.team1_odds;
  const implied2 = 1 / entry.bookmaker_odds.team2_odds;
  const total = implied1 + implied2;
  if (total <= 0) return null;

  const normalized1 = implied1 / total;
  const normalized2 = implied2 / total;
  const gap1 = Math.round((entry.team1_win_probability - normalized1) * 100);
  const gap2 = Math.round((entry.team2_win_probability - normalized2) * 100);

  return Math.abs(gap1) >= Math.abs(gap2)
    ? { team: entry.team1, gap: gap1 }
    : { team: entry.team2, gap: gap2 };
}

export function LedgerCard({
  entry,
  index = 0,
}: {
  entry: LedgerEntry;
  index?: number;
}) {
  const scorecards = buildScorecardSummaries(entry.scorecards);
  const team1Meta = getTeamMeta(entry.team1);
  const team2Meta = getTeamMeta(entry.team2);
  const marketGap = getMarketGap(entry);
  const winner = entry.actual_winner;
  const pickedTeam = entry.predicted_winner;

  return (
    <Link href={`/predict?id=${encodeURIComponent(entry.match_id)}`} className="group block">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        whileHover={{ y: -4, scale: 1.01 }}
        className="relative overflow-hidden rounded-[18px] border border-slate-700/45 bg-[#131922]/95 backdrop-blur-xl"
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 opacity-[0.07]"
          style={{ background: `radial-gradient(circle at 18% 40%, ${team1Meta.primaryColor}, transparent 65%)` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-[0.07]"
          style={{ background: `radial-gradient(circle at 82% 40%, ${team2Meta.primaryColor}, transparent 65%)` }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full transition-transform duration-[1100ms] group-hover:translate-x-full" />

        <div className="relative p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <MatchFormatBadge match={{ name: entry.name, match_type: entry.match_type, competition_name: entry.competition_name ?? null }} />
              <span className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                {entry.competition_name || 'Settled match'}
              </span>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${
              entry.correct
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-rose-500/15 text-rose-200'
            }`}>
              {entry.correct ? 'Called it' : 'Missed'}
            </span>
          </div>

          <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
            <div className="min-w-0 text-center">
              <TeamMark team={entry.team1} selected={winner === entry.team1} />
              <p className="truncate text-sm font-black text-white">{team1Meta.shortName}</p>
              {scorecards.find((line) => line.teamName === entry.team1)?.total && (
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  {scorecards.find((line) => line.teamName === entry.team1)?.total}
                </p>
              )}
            </div>

            <div className="flex flex-col items-center gap-1 pt-4">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">final</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                {pickedTeam === winner ? 'Pick landed' : 'Pick missed'}
              </span>
            </div>

            <div className="min-w-0 text-center">
              <TeamMark team={entry.team2} selected={winner === entry.team2} />
              <p className="truncate text-sm font-black text-white">{team2Meta.shortName}</p>
              {scorecards.find((line) => line.teamName === entry.team2)?.total && (
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  {scorecards.find((line) => line.teamName === entry.team2)?.total}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-black/15 px-3 py-3">
            <p className="text-sm font-bold leading-snug text-white">
              {entry.result_text || `${winner} won`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-300">
                SixSense picked <span className="font-black text-white">{pickedTeam}</span>
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-300">
                {Math.round(entry.predicted_probability * 100)}% confidence
              </span>
              {entry.edge_score && (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-200">
                  Edge {entry.edge_score.net_edge > 0 ? '+' : ''}{entry.edge_score.net_edge.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          {(marketGap || scorecards[0]?.topBatter) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
              {marketGap && (
                <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-sky-100">
                  {marketGap.team} {marketGap.gap >= 0 ? '+' : ''}{marketGap.gap} pts vs {entry.bookmaker_odds?.bookmaker}
                </span>
              )}
              {scorecards[0]?.topBatter && (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-300">
                  {scorecards[0].topBatter}
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-2.5 text-[10px]">
            <p className="min-w-0 truncate text-slate-500">{entry.venue || entry.series_scoreline || 'Settled recap'}</p>
            <span className="shrink-0 font-black uppercase tracking-[0.16em] text-amber-100 transition-colors group-hover:text-white">
              Match recap →
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
