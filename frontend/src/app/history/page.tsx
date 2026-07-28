'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CricketLoader } from '@/components/CricketLoader';
import { TeamBadge } from '@/components/TeamBadge';
import { getPredictionHistory, PredictionHistoryItem } from '@/lib/supabase';

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
      {value} confidence
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

function HistoryCard({ result, index }: { result: PredictionHistoryItem; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const team1 = result.team1 || result.predicted_winner;
  const team2 = result.team2 || result.actual_winner;
  const hasDetail = Boolean(result.reasoning || result.team1_win_probability !== undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.3 }}
      className="bg-gray-800/40 border border-gray-700/40 rounded-2xl overflow-hidden hover:border-cricket-700/40 transition-colors"
    >
      {/* Summary row */}
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-4"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Teams */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <TeamBadge teamName={team1} size="sm" showName={false} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {team1} <span className="text-gray-500 font-normal">vs</span> {team2}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {new Date(result.scored_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <TeamBadge teamName={team2} size="sm" showName={false} />
        </div>

        {/* Predicted winner */}
        <div className="hidden sm:block text-right min-w-[100px]">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">AI Predicted</p>
          <p className="text-xs font-semibold text-gray-300 mt-0.5 truncate">{result.predicted_winner}</p>
        </div>

        {/* Probability */}
        <div className="text-right min-w-[52px]">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">Prob</p>
          <p className="text-sm font-bold text-cricket-400">{(result.predicted_probability * 100).toFixed(0)}%</p>
        </div>

        {/* Result pill */}
        <span className={`shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold ${
          result.correct
            ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
            : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
        }`}>
          {result.correct ? '✓ Correct' : '✗ Wrong'}
        </span>

        {/* Expand chevron */}
        {hasDetail && (
          <motion.span
            className="text-gray-600 text-xs ml-1 shrink-0"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            ▼
          </motion.span>
        )}
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

              {/* Prediction vs Reality */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">AI Predicted</p>
                  <div className="flex items-center gap-2">
                    <TeamBadge teamName={result.predicted_winner} size="sm" showName={false} />
                    <span className="text-sm font-semibold text-white">{result.predicted_winner}</span>
                  </div>
                </div>
                <div className={`rounded-xl p-3 ${result.correct ? 'bg-emerald-950/40' : 'bg-red-950/30'}`}>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Actual Result</p>
                  <div className="flex items-center gap-2">
                    <TeamBadge teamName={result.actual_winner} size="sm" showName={false} />
                    <span className={`text-sm font-semibold ${result.correct ? 'text-emerald-300' : 'text-red-300'}`}>
                      {result.actual_winner}
                    </span>
                  </div>
                </div>
              </div>

              {/* Probability breakdown */}
              {result.team1_win_probability !== undefined && result.team2_win_probability !== undefined && (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pre-match probability</p>
                  <ProbBar
                    label={team1}
                    prob={result.team1_win_probability}
                    isWinner={result.actual_winner === team1}
                    isPredicted={result.predicted_winner === team1}
                  />
                  <ProbBar
                    label={team2}
                    prob={result.team2_win_probability}
                    isWinner={result.actual_winner === team2}
                    isPredicted={result.predicted_winner === team2}
                  />
                </div>
              )}

              {/* AI Reasoning */}
              {result.reasoning && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">AI Reasoning</p>
                    <ConfidencePill value={result.confidence} />
                  </div>
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
                  <span className="ml-2 text-gray-700">— lower is better (0 = perfect)</span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
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

  const filteredResults = results.filter((r) => {
    if (filter === 'correct') return r.correct;
    if (filter === 'incorrect') return !r.correct;
    return true;
  });

  if (loading) return <CricketLoader />;

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">
          Prediction <span className="text-cricket-400">History</span>
        </h1>
        <p className="text-gray-400 mb-8 text-sm">
          Tap any result to see the full AI breakdown vs what actually happened
        </p>
      </motion.div>

      <motion.div
        className="flex items-center justify-between mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex space-x-2">
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
        </div>
        <p className="text-xs text-gray-600">{filteredResults.length} results</p>
      </motion.div>

      {filteredResults.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-gray-500 py-20 bg-gray-900/40 rounded-2xl border border-gray-800/30"
        >
          <p className="text-lg">No prediction history available</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filteredResults.map((result, i) => (
            <HistoryCard key={result.prediction_id} result={result} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
