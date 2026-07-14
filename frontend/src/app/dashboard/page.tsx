'use client';

import { useEffect, useState } from 'react';
import { getDashboardStats } from '@/lib/supabase';
import { AccuracyDashboard } from '@/components/AccuracyDashboard';

interface Stats {
  total: number;
  correct: number;
  accuracy: number;
  avgBrier: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getDashboardStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cricket-400" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-cricket-300 mb-2">Dashboard</h1>
      <p className="text-gray-400 mb-8">Prediction accuracy and model performance</p>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800">
            <p className="text-sm text-gray-400 uppercase tracking-wide">Accuracy</p>
            <p className="text-3xl font-bold text-cricket-300">{(stats.accuracy * 100).toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">{stats.correct} / {stats.total} correct</p>
          </div>
          <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800">
            <p className="text-sm text-gray-400 uppercase tracking-wide">Avg Brier Score</p>
            <p className="text-3xl font-bold text-cricket-300">{stats.avgBrier.toFixed(4)}</p>
            <p className="text-sm text-gray-500 mt-1">Lower is better</p>
          </div>
          <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800">
            <p className="text-sm text-gray-400 uppercase tracking-wide">Total Predictions</p>
            <p className="text-3xl font-bold text-cricket-300">{stats.total}</p>
            <p className="text-sm text-gray-500 mt-1">All time</p>
          </div>
        </div>
      )}

      <AccuracyDashboard />
    </div>
  );
}
