'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CricketLoader } from '@/components/CricketLoader';
import { TeamBadge } from '@/components/TeamBadge';
import {
  GlobeIcon, ShieldIcon, TrophyIcon, SparkleIcon,
  ChevronDownIcon, CoinIcon, TargetIcon,
} from '@/components/CricketIcons';
import { getPredictionHistory, PredictionHistoryItem } from '@/lib/supabase';
import {
  computeAccuracy,
  filterHistoryByPeriod,
  isInternationalMatch,
  type AccuracyPeriod as Period,
} from '@/lib/prediction-history';

type Outcome = 'all' | 'correct' | 'incorrect';

// ─── sub-components ─────────────────────────────────────────────────────────

// Cricket keyword → chip label mapping for factor extraction
const FACTOR_KEYWORDS: [RegExp, string][] = [
  [/home (advantage|ground|crowd)/i, 'Home advantage'],
  [/dew factor|dew conditions/i, 'Dew factor'],
  [/toss|win the toss/i, 'Toss matters'],
  [/(batting|bowling) (form|lineup|strength)/i, 'Form in focus'],
  [/pitch (condition|report|behavior|favour)/i, 'Pitch conditions'],
  [/weather|overcast|humid/i, 'Weather factor'],
  [/head.to.head|h2h|historically|history between/i, 'H2H history'],
  [/momentum|recent form|winning streak|in form/i, 'In-form side'],
  [/strong batting|top order|lower order/i, 'Batting depth'],
  [/pace attack|spin attack|bowling attack/i, 'Bowling threat'],
  [/(chasing|defending) total/i, 'Chase dynamics'],
  [/day.night|floodlight|night game/i, 'D/N conditions'],
  [/injury|doubt|ruled out|miss/i, 'Team news'],
  [/experience|senior/i, 'Experience edge'],
];

function extractFactors(reasoning?: string): string[] {
  if (!reasoning) return [];
  const found: string[] = [];
  for (const [pattern, label] of FACTOR_KEYWORDS) {
    if (pattern.test(reasoning) && !found.includes(label)) found.push(label);
    if (found.length >= 4) break;
  }
  return found;
}

function ConfidencePill({ value }: { value?: string }) {
  if (!value) return null;
  const styles: Record<string, string> = {
    high: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
    medium: 'bg-amber-600/15 text-amber-500 ring-1 ring-amber-600/20',
    low: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${styles[value] ?? styles.medium}`}>
      {value}
    </span>
  );
}

function ProbBar({ label, prob, isWinner, isPredicted }: { label: string; prob: number; isWinner: boolean; isPredicted: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`text-xs w-24 truncate font-medium ${isWinner ? 'text-white' : 'text-slate-400'}`}>{label}</span>
      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: isWinner ? '#f59e0b' : '#4b5563' }}
          initial={{ width: 0 }}
          animate={{ width: `${prob * 100}%` }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        />
      </div>
      <span className={`text-xs font-bold w-10 text-right ${isWinner ? 'text-amber-600' : 'text-slate-500'}`}>
        {(prob * 100).toFixed(0)}%
      </span>
      {isPredicted && <span className="text-[10px] text-slate-500">AI pick</span>}
    </div>
  );
}

function AccuracyStrip({
  intl, league, period,
}: {
  intl: ReturnType<typeof computeAccuracy>;
  league: ReturnType<typeof computeAccuracy>;
  period: Period;
}) {
  const periodLabel = period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'All time';
  if (!intl && !league) return null;
  return (
    <motion.div
      className="mb-5 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      {/* International */}
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <GlobeIcon className="w-5 h-5 text-amber-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">International · {periodLabel}</p>
          {intl ? (
            <p className="text-xl font-black text-white">
              {intl.pct}%
              <span className="text-xs font-normal text-gray-500 ml-2">{intl.correct}/{intl.total}</span>
            </p>
          ) : (
            <p className="text-sm text-slate-500">No data</p>
          )}
        </div>
      </div>

      {/* League */}
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <ShieldIcon className="w-5 h-5 text-slate-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">League · {periodLabel}</p>
          {league ? (
            <p className="text-xl font-black text-white">
              {league.pct}%
              <span className="text-xs font-normal text-gray-500 ml-2">{league.correct}/{league.total}</span>
            </p>
          ) : (
            <p className="text-sm text-slate-500">No data</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function MatchupVisual({ result }: { result: PredictionHistoryItem }) {
  const team1 = result.team1 || result.predicted_winner;
  const team2 = result.team2 || result.actual_winner;
  const t1Won = result.actual_winner === team1;
  const t2Won = result.actual_winner === team2;
  const aiT1 = result.predicted_winner === team1;
  const aiT2 = result.predicted_winner === team2;

  return (
    <div className="flex items-stretch gap-3">
      {/* Team 1 */}
      <div className={`flex-1 flex flex-col items-center gap-1 py-1 ${t2Won ? 'opacity-45' : ''}`}>
        <TeamBadge teamName={team1} size="sm" showName={false} isWinner={t1Won} />
        <p className="text-[11px] font-semibold text-white text-center truncate max-w-[80px]">{team1}</p>
        <div className="flex flex-col items-center gap-0.5 min-h-[30px] justify-end">
          {t1Won && <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400"><TrophyIcon className="w-3 h-3" /> Won</span>}
          {aiT1 && <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600"><SparkleIcon className="w-3 h-3" /> AI pick</span>}
        </div>
      </div>

      {/* Centre verdict */}
      <div className="flex flex-col items-center justify-center gap-1 shrink-0 w-12">
        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">vs</span>
        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
          result.correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {result.correct ? '✓' : '✗'}
        </span>
      </div>

      {/* Team 2 */}
      <div className={`flex-1 flex flex-col items-center gap-1 py-1 ${t1Won ? 'opacity-45' : ''}`}>
        <TeamBadge teamName={team2} size="sm" showName={false} isWinner={t2Won} />
        <p className="text-[11px] font-semibold text-white text-center truncate max-w-[80px]">{team2}</p>
        <div className="flex flex-col items-center gap-0.5 min-h-[30px] justify-end">
          {t2Won && <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400"><TrophyIcon className="w-3 h-3" /> Won</span>}
          {aiT2 && <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600"><SparkleIcon className="w-3 h-3" /> AI pick</span>}
        </div>
      </div>
    </div>
  );
}

function ReasoningToggle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1.5 rounded-lg pr-3 text-[10px] text-slate-500 transition-colors hover:text-slate-300"
        aria-expanded={open}
      >
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDownIcon className="w-3 h-3" />
        </motion.span>
        Full AI report
      </button>
      <AnimatePresence>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="text-xs text-gray-500 leading-relaxed mt-2 overflow-hidden"
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryCard({ result, index }: { result: PredictionHistoryItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const team1 = result.team1 || result.predicted_winner;
  const team2 = result.team2 || result.actual_winner;
  const hasDetail = Boolean(result.reasoning || result.team1_win_probability !== undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.35), duration: 0.22 }}
      className="bg-gradient-to-br from-[#121922]/90 to-[#0c1218]/90 border border-slate-700/40 rounded-2xl overflow-hidden hover:border-amber-600/30 transition-colors"
    >
      <button
        className="w-full text-left px-4 py-3.5"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <MatchupVisual result={result} />
          </div>

          {/* Right meta */}
          <div className="flex flex-col items-end gap-1.5 shrink-0 pl-3 border-l border-white/10 min-w-[80px]">
            <p className="text-[10px] text-slate-500">
              {new Date(result.scored_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
            <ConfidencePill value={result.confidence} />
            <span className="text-[11px] text-slate-500">{(result.predicted_probability * 100).toFixed(0)}% conf.</span>
            {hasDetail && (
              <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
                <ChevronDownIcon className="w-3.5 h-3.5 text-slate-500" />
              </motion.span>
            )}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-3 border-t border-white/10 space-y-4">

              {/* ── Verdict banner ── */}
              <div className={`rounded-xl px-4 py-3 flex items-start gap-3 ${
                result.correct
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : 'bg-red-500/10 border border-red-500/20'
              }`}>
                <span className={`text-xl font-black shrink-0 ${result.correct ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.correct ? '✓' : '✗'}
                </span>
                <div>
                  <p className={`text-sm font-black ${result.correct ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.correct ? 'AI called it' : 'AI missed this one'}
                  </p>
                  {result.result_text ? (
                    <p className="text-xs text-slate-400 mt-0.5">{result.result_text}</p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {result.actual_winner} won
                    </p>
                  )}
                </div>
              </div>

              {/* ── Probability bars with edge ── */}
              {result.team1_win_probability !== undefined && result.team2_win_probability !== undefined && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pre-match probability</p>
                    {/* Edge badge — how far AI was from coinflip */}
                    {(() => {
                      const edge = Math.round((Math.max(result.team1_win_probability, result.team2_win_probability) - 0.5) * 100);
                      return edge >= 5 ? (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-600/10 border border-amber-600/25 px-2 py-0.5 rounded-full">
                          +{edge}% above coinflip
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 bg-white/[0.04] border border-white/10 px-2 py-0.5 rounded-full">
                          Near 50/50
                        </span>
                      );
                    })()}
                  </div>
                  <ProbBar label={team1} prob={result.team1_win_probability} isWinner={result.actual_winner === team1} isPredicted={result.predicted_winner === team1} />
                  <ProbBar label={team2} prob={result.team2_win_probability} isWinner={result.actual_winner === team2} isPredicted={result.predicted_winner === team2} />
                </div>
              )}

              {/* ── Key fact rows ── */}
              <div className="space-y-2">

                {/* AI's call + outcome */}
                <div className="flex items-center justify-between bg-white/[0.04] rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <SparkleIcon className="w-3.5 h-3.5 text-cricket-500 shrink-0" />
                    <span className="text-xs text-slate-400">AI picked</span>
                    <span className="text-xs font-semibold text-white">{result.predicted_winner}</span>
                    <span className="text-xs text-slate-500">at {(result.predicted_probability * 100).toFixed(0)}%</span>
                  </div>
                  <span className={`text-xs font-bold ${result.correct ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.correct ? 'Correct' : `${result.actual_winner} won`}
                  </span>
                </div>

                {/* Edge signal */}
                {(() => {
                  const edge = Math.round((result.predicted_probability - 0.5) * 100);
                  if (edge < 3) return null;
                  const strong = edge >= 15;
                  return (
                    <div className="flex items-center justify-between bg-white/[0.04] rounded-xl px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <TargetIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-xs text-slate-400">Signal strength</span>
                      </div>
                      <span className={`text-xs font-bold ${strong ? 'text-amber-600' : 'text-amber-500'}`}>
                        +{edge}% above coinflip · {strong ? 'Strong edge' : 'Moderate edge'}
                      </span>
                    </div>
                  );
                })()}

                {/* Toss outcome — structured data if available */}
                {result.toss_winner && (
                  <div className="flex items-center justify-between bg-white/[0.04] rounded-xl px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <CoinIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <span className="text-xs text-slate-400">Toss</span>
                      <span className="text-xs font-semibold text-white">{result.toss_winner}</span>
                      {result.toss_decision && (
                        <span className="text-xs text-slate-500">→ chose to {result.toss_decision}</span>
                      )}
                    </div>
                    <span className={`text-xs font-bold ${
                      result.toss_winner === result.actual_winner ? 'text-emerald-400' : 'text-gray-500'
                    }`}>
                      {result.toss_winner === result.actual_winner ? 'Toss winner won' : 'Toss winner lost'}
                    </span>
                  </div>
                )}

              </div>

              {/* ── Full AI reasoning — collapsible ── */}
              {result.reasoning && <ReasoningToggle text={result.reasoning} />}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SectionBlock({
  icon, title, badge, items,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  items: PredictionHistoryItem[];
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-slate-400">{icon}</span>
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">{title}</h2>
        <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10">{badge}</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>
      <div className="space-y-3">
        {items.map((r, i) => <HistoryCard key={r.prediction_id} result={r} index={i} />)}
      </div>
    </div>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [results, setResults] = useState<PredictionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [outcome, setOutcome] = useState<Outcome>('all');

  useEffect(() => {
    getPredictionHistory()
      .then(setResults)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  // Accuracy metrics: period-only (never polluted by outcome filter)
  const byPeriod = filterHistoryByPeriod(results, period);
  const intlAccuracy = computeAccuracy(byPeriod.filter(isInternationalMatch));
  const leagueAccuracy = computeAccuracy(byPeriod.filter((r) => !isInternationalMatch(r)));

  // Cards: period + outcome
  const filtered = byPeriod.filter((r) => {
    if (outcome === 'correct') return r.correct;
    if (outcome === 'incorrect') return !r.correct;
    return true;
  });
  const international = filtered.filter(isInternationalMatch);
  const league = filtered.filter((r) => !isInternationalMatch(r));

  if (loading) return <CricketLoader />;

  const periodOptions: { key: Period; label: string }[] = [
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' },
  ];

  const outcomeOptions: { key: Outcome; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'correct', label: 'Correct' },
    { key: 'incorrect', label: 'Incorrect' },
  ];

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Prediction <span className="text-amber-600">History</span>
        </h1>
        <p className="text-slate-500 mb-5 text-sm">Tap any result to see the full AI breakdown</p>
      </motion.div>

      {/* Accuracy strip — always reflects period, never outcome filter */}
      <AccuracyStrip intl={intlAccuracy} league={leagueAccuracy} period={period} />

      {/* Controls row */}
      <motion.div
        className="mb-6 flex flex-wrap items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.12 }}
      >
        {/* Period tabs */}
        <div className="grid w-full grid-cols-3 gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1 sm:flex sm:w-auto">
          {periodOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              aria-pressed={period === key}
              className={`min-h-11 rounded-lg px-2 py-2 text-xs font-semibold transition-all sm:min-h-0 sm:px-3 sm:py-1.5 ${
                period === key
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-700/60 hidden sm:block" />

        {/* Outcome filter */}
        <div className="grid w-full grid-cols-3 gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1 sm:flex sm:w-auto">
          {outcomeOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setOutcome(key)}
              aria-pressed={outcome === key}
              className={`min-h-11 rounded-lg px-2 py-2 text-xs font-semibold transition-all sm:min-h-0 sm:px-3 sm:py-1.5 ${
                outcome === key
                  ? outcome === 'correct' ? 'bg-emerald-500/20 text-emerald-400'
                  : outcome === 'incorrect' ? 'bg-red-500/20 text-red-400'
                  : 'bg-slate-700/60 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="ml-auto text-xs text-slate-500">{filtered.length} results</p>
      </motion.div>

      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-slate-500 py-20 bg-white/[0.04] rounded-2xl border border-white/10"
        >
          <p>No results for this period</p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          <SectionBlock
            icon={<GlobeIcon className="w-4 h-4" />}
            title="International"
            badge="richer data"
            items={international}
          />
          <SectionBlock
            icon={<ShieldIcon className="w-4 h-4" />}
            title="League Cricket"
            badge="limited data"
            items={league}
          />
        </div>
      )}
    </div>
  );
}
