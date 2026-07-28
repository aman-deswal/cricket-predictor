'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CricketLoader } from '@/components/CricketLoader';
import { TeamBadge } from '@/components/TeamBadge';
import { getPredictionHistory, PredictionHistoryItem } from '@/lib/supabase';

import { getTeamMeta } from '@/lib/teams';

type Filter = 'all' | 'correct' | 'incorrect';

function ConfidencePill({ value }: { value?: string }) {
  if (!value) return null;
  const styles: Record<string, string> = {
    high: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
    medium: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
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
      <span className={`text-xs w-24 truncate font-medium ${isWinner ? 'text-white' : 'text-gray-400'}`}>{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: isWinner ? '#f59e0b' : '#4b5563' }}
          initial={{ width: 0 }}
          animate={{ width: `${prob * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className={`text-xs font-bold w-10 text-right ${isWinner ? 'text-cricket-400' : 'text-gray-500'}`}>
        {(prob * 100).toFixed(0)}%
      </span>
      {isPredicted && <span className="text-[10px] text-gray-600 font-medium">AI pick</span>}
    </div>
  );
}

/** Visual matchup: both teams side by side, actual winner and AI pick clearly marked. */
function MatchupVisual({ result }: { result: PredictionHistoryItem }) {
  const team1 = result.team1 || result.predicted_winner;
  const team2 = result.team2 || result.actual_winner;
  const team1Won = result.actual_winner === team1;
  const team2Won = result.actual_winner === team2;
  const aiPickedTeam1 = result.predicted_winner === team1;
  const aiPickedTeam2 = result.predicted_winner === team2;

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {/* Team 1 */}
      <div className={`flex-1 flex flex-col items-center gap-1 transition-opacity ${team2Won ? 'opacity-40' : ''}`}>
        <TeamBadge teamName={team1} size="sm" showName={false} isWinner={team1Won} />
        <p className="text-[11px] font-semibold text-white text-center truncate max-w-[72px]">{team1}</p>
        <div className="flex flex-col items-center gap-0.5 min-h-[28px]">
          {team1Won && (
            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">🏆 Won</span>
          )}
          {aiPickedTeam1 && (
            <span className="text-[9px] text-cricket-400 font-semibold flex items-center gap-0.5">🤖 AI pick</span>
          )}
        </div>
      </div>

      {/* Centre verdict */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">vs</span>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-md ${
          result.correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {result.correct ? '✓' : '✗'}
        </span>
        <span className={`text-[9px] font-semibold ${result.correct ? 'text-emerald-600' : 'text-red-600'}`}>
          {result.correct ? 'Correct' : 'Wrong'}
        </span>
      </div>

      {/* Team 2 */}
      <div className={`flex-1 flex flex-col items-center gap-1 transition-opacity ${team1Won ? 'opacity-40' : ''}`}>
        <TeamBadge teamName={team2} size="sm" showName={false} isWinner={team2Won} />
        <p className="text-[11px] font-semibold text-white text-center truncate max-w-[72px]">{team2}</p>
        <div className="flex flex-col items-center gap-0.5 min-h-[28px]">
          {team2Won && (
            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">🏆 Won</span>
          )}
          {aiPickedTeam2 && (
            <span className="text-[9px] text-cricket-400 font-semibold flex items-center gap-0.5">🤖 AI pick</span>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ result, index }: { result: PredictionHistoryItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(result.reasoning || result.team1_win_probability !== undefined);
  const team1 = result.team1 || result.predicted_winner;
  const team2 = result.team2 || result.actual_winner;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.4), duration: 0.25 }}
      className="bg-gray-800/40 border border-gray-700/40 rounded-2xl overflow-hidden hover:border-cricket-700/30 transition-colors"
    >
      <button
        className="w-full text-left px-4 py-4"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-4">
          {/* Matchup visual — core story */}
          <div className="flex-1 min-w-0">
            <MatchupVisual result={result} />
          </div>

          {/* Right meta column */}
          <div className="flex flex-col items-end gap-2 shrink-0 pl-2 border-l border-gray-700/40">
            <span className="text-[11px] text-gray-500">
              {(result.predicted_probability * 100).toFixed(0)}% conf.
            </span>
            <ConfidencePill value={result.confidence} />
            {hasDetail && (
              <motion.span
                className="text-gray-600 text-[10px]"
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                ▼
              </motion.span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-gray-700/40 space-y-4">

              {/* Probability breakdown */}
              {result.team1_win_probability !== undefined && result.team2_win_probability !== undefined && (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pre-match probability</p>
                  <ProbBar label={team1} prob={result.team1_win_probability} isWinner={result.actual_winner === team1} isPredicted={result.predicted_winner === team1} />
                  <ProbBar label={team2} prob={result.team2_win_probability} isWinner={result.actual_winner === team2} isPredicted={result.predicted_winner === team2} />
                </div>
              )}

              {/* AI Reasoning */}
              {result.reasoning && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">AI Reasoning</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{result.reasoning}</p>
                </div>
              )}

              {/* Toss insight */}
              {result.toss_insight && (
                <div className="bg-cricket-950/40 border border-cricket-800/20 rounded-xl px-4 py-3">
                  <p className="text-[10px] text-cricket-600 uppercase tracking-wider mb-1">🎲 Toss Insight</p>
                  <p className="text-sm text-cricket-200/80 leading-relaxed">{result.toss_insight}</p>
                </div>
              )}

              {/* Brier score */}
              {result.brier_score !== null && (
                <p className="text-[11px] text-gray-600">
                  Brier score: <span className="text-gray-500">{result.brier_score.toFixed(3)}</span>
                  <span className="ml-2 text-gray-700">lower = better (0 = perfect)</span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function isInternationalMatch(result: PredictionHistoryItem): boolean {
  const t1 = result.team1 || result.predicted_winner;
  const t2 = result.team2 || result.actual_winner;
  return Boolean(getTeamMeta(t1).countryCode) && Boolean(getTeamMeta(t2).countryCode);
}

function dateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  if (diffDays < 14) return 'Last week';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function groupByDate(items: PredictionHistoryItem[]) {
  const groups: { label: string; items: PredictionHistoryItem[] }[] = [];
  const seen = new Map<string, PredictionHistoryItem[]>();
  for (const item of items) {
    const label = dateGroupLabel(item.scored_at);
    if (!seen.has(label)) {
      seen.set(label, []);
      groups.push({ label, items: seen.get(label)! });
    }
    seen.get(label)!.push(item);
  }
  return groups;
}

export default function HistoryPage() {
  const [results, setResults] = useState<PredictionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    async function load() {
      try {
        const data = await getPredictionHistory();
        setResults(data);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = results.filter((r) => {
    if (filter === 'correct') return r.correct;
    if (filter === 'incorrect') return !r.correct;
    return true;
  });

  const total = filtered.length;
  const correct = filtered.filter((r) => r.correct).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  const international = filtered.filter(isInternationalMatch);
  const league = filtered.filter((r) => !isInternationalMatch(r));

  const intlGroups = groupByDate(international);
  const leagueGroups = groupByDate(league);

  if (loading) return <CricketLoader />;

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">
          Prediction <span className="text-cricket-400">History</span>
        </h1>
        <p className="text-gray-400 mb-6 text-sm">Tap any result to see the full AI breakdown</p>
      </motion.div>

      {/* Summary strip */}
      {total > 0 && (
        <motion.div
          className="flex items-center gap-6 mb-6 px-4 py-3 bg-gray-800/40 rounded-xl border border-gray-700/40"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="text-center">
            <p className="text-2xl font-black text-cricket-400">{accuracy}%</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Accuracy</p>
          </div>
          <div className="w-px h-8 bg-gray-700/60" />
          <div className="text-center">
            <p className="text-xl font-bold text-emerald-400">{correct}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-red-400">{total - correct}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Wrong</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Showing</p>
            <p className="text-sm font-semibold text-gray-300">{total} results</p>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        className="flex space-x-2 mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        {(['all', 'correct', 'incorrect'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
              filter === f
                ? 'bg-cricket-500 text-white shadow-lg shadow-cricket-500/20'
                : 'bg-gray-900/50 text-gray-400 hover:text-white border border-gray-700/50 hover:border-cricket-800/50'
            }`}
          >
            {f}
          </button>
        ))}
      </motion.div>

      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-gray-500 py-20 bg-gray-900/40 rounded-2xl border border-gray-800/30"
        >
          <p className="text-lg">No prediction history available</p>
        </motion.div>
      ) : (
        <div className="space-y-10">
          {/* Tier 1: International matches */}
          {intlGroups.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-lg">🌐</span>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">International</h2>
                <span className="text-[10px] text-gray-600 px-2 py-0.5 rounded-full bg-gray-800/60 border border-gray-700/40">
                  {international.length} predictions · richer data
                </span>
                <div className="flex-1 h-px bg-gray-800/60" />
              </div>
              <div className="space-y-8">
                {intlGroups.map(({ label, items }) => (
                  <div key={label}>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</p>
                      <div className="flex-1 h-px bg-gray-800/40" />
                      <p className="text-[10px] text-gray-700">{items.length}</p>
                    </div>
                    <div className="space-y-3">
                      {items.map((result, i) => (
                        <HistoryCard key={result.prediction_id} result={result} index={i} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tier 2: Domestic league matches */}
          {leagueGroups.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-lg">🏏</span>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">League Cricket</h2>
                <span className="text-[10px] text-gray-600 px-2 py-0.5 rounded-full bg-gray-800/60 border border-gray-700/40">
                  {league.length} predictions · limited data
                </span>
                <div className="flex-1 h-px bg-gray-800/60" />
              </div>
              <div className="space-y-8">
                {leagueGroups.map(({ label, items }) => (
                  <div key={label}>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</p>
                      <div className="flex-1 h-px bg-gray-800/40" />
                      <p className="text-[10px] text-gray-700">{items.length}</p>
                    </div>
                    <div className="space-y-3">
                      {items.map((result, i) => (
                        <HistoryCard key={result.prediction_id} result={result} index={i} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
