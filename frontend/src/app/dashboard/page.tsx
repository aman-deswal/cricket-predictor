'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
        <motion.div
          className="rounded-full h-10 w-10 border-2 border-cricket-400 border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">
          <span className="text-cricket-400">Dashboard</span>
        </h1>
        <p className="text-gray-500 mb-10 text-sm">Prediction accuracy and model performance</p>
      </motion.div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {[
            { label: 'Accuracy', value: `${(stats.accuracy * 100).toFixed(1)}%`, sub: `${stats.correct} / ${stats.total} correct`, icon: '🎯' },
            { label: 'Avg Brier Score', value: stats.avgBrier.toFixed(4), sub: 'Lower is better', icon: '📊' },
            { label: 'Total Predictions', value: stats.total.toString(), sub: 'All time', icon: '🏏' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="relative bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-6 border border-cricket-800/30 overflow-hidden group hover:border-cricket-600/30 transition-colors"
            >
              <div className="absolute top-3 right-3 text-2xl opacity-30 group-hover:opacity-60 transition-opacity">
                {stat.icon}
              </div>
              <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-semibold">{stat.label}</p>
              <motion.p
                className="text-3xl font-black text-white mt-2"
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.3 + i * 0.1 }}
              >
                {stat.value}
              </motion.p>
              <p className="text-xs text-gray-500 mt-1">{stat.sub}</p>
            </motion.div>
          ))}
        </div>
      )}

      <AccuracyDashboard />
    </div>
  );
}
