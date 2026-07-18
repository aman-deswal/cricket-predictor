'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CricketLoader } from '@/components/CricketLoader';
import { getPredictionHistory, PredictionResult } from '@/lib/supabase';

export default function HistoryPage() {
  const [results, setResults] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect'>('all');

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

  if (loading) {
    return <CricketLoader />;
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">
          Prediction <span className="text-cricket-400">History</span>
        </h1>
        <p className="text-gray-500 mb-8 text-sm">All past predictions and their outcomes</p>
      </motion.div>

      <motion.div
        className="flex space-x-2 mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {(['all', 'correct', 'incorrect'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
              filter === f
                ? 'bg-cricket-500 text-white shadow-lg shadow-cricket-500/20'
                : 'bg-gray-900/50 text-gray-500 hover:text-white border border-gray-800/50 hover:border-cricket-800/50'
            }`}
          >
            {f}
          </button>
        ))}
      </motion.div>

      {filteredResults.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-gray-500 py-20 bg-gradient-to-br from-gray-900/50 to-cricket-950/50 rounded-2xl border border-gray-800/30"
        >
          <p className="text-lg">No prediction history available</p>
        </motion.div>
      ) : (
        <motion.div
          className="bg-gradient-to-br from-gray-900/60 to-cricket-950/60 backdrop-blur-xl rounded-2xl border border-cricket-800/20 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800/50 text-[10px] text-gray-500 uppercase tracking-[0.15em] text-left">
                  <th className="py-4 px-5">Match</th>
                  <th className="py-4 px-5">Predicted</th>
                  <th className="py-4 px-5">Actual</th>
                  <th className="py-4 px-5">Probability</th>
                  <th className="py-4 px-5">Result</th>
                  <th className="py-4 px-5">Date</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredResults.map((result, i) => (
                    <motion.tr
                      key={result.prediction_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-gray-800/30 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 px-5 text-gray-300 font-medium">{result.match_id}</td>
                      <td className="py-3.5 px-5 text-gray-300">{result.predicted_winner}</td>
                      <td className="py-3.5 px-5 text-gray-300">{result.actual_winner}</td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-cricket-500"
                              style={{ width: `${result.predicted_probability * 100}%` }}
                            />
                          </div>
                          <span className="text-gray-400 text-xs">{(result.predicted_probability * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                          result.correct
                            ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
                            : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                        }`}>
                          {result.correct ? '✓ Correct' : '✗ Wrong'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-gray-600 text-xs">
                        {new Date(result.scored_at).toLocaleDateString()}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
