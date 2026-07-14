'use client';

import { useEffect, useState } from 'react';
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cricket-400" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-cricket-300 mb-2">Prediction History</h1>
      <p className="text-gray-400 mb-6">All past predictions and their outcomes</p>

      <div className="flex space-x-2 mb-6">
        {(['all', 'correct', 'incorrect'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-cricket-600 text-white'
                : 'bg-cricket-900/50 text-gray-400 hover:text-white border border-cricket-800'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filteredResults.length === 0 ? (
        <div className="text-center text-gray-500 py-16">
          <p>No prediction history available</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cricket-800 text-gray-400 text-left">
                <th className="py-3 px-4">Match</th>
                <th className="py-3 px-4">Predicted</th>
                <th className="py-3 px-4">Actual</th>
                <th className="py-3 px-4">Probability</th>
                <th className="py-3 px-4">Result</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((result) => (
                <tr key={result.prediction_id} className="border-b border-cricket-800/50 hover:bg-cricket-900/30">
                  <td className="py-3 px-4 text-gray-300">{result.match_id}</td>
                  <td className="py-3 px-4 text-gray-300">{result.predicted_winner}</td>
                  <td className="py-3 px-4 text-gray-300">{result.actual_winner}</td>
                  <td className="py-3 px-4 text-gray-300">{(result.predicted_probability * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      result.correct
                        ? 'bg-green-900/50 text-green-300'
                        : 'bg-red-900/50 text-red-300'
                    }`}>
                      {result.correct ? '✓ Correct' : '✗ Wrong'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500">
                    {new Date(result.scored_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
