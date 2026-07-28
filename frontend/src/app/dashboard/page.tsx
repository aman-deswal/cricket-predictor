'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CricketLoader } from '@/components/CricketLoader';
import { getDashboardStats, getAccuracyBySplit } from '@/lib/supabase';
import { AccuracyDashboard } from '@/components/AccuracyDashboard';
import { TargetIcon, BarChartIcon, BowlIcon, GlobeIcon, ShieldIcon } from '@/components/CricketIcons';

interface Stats {
  total: number;
  correct: number;
  accuracy: number;
  avgBrier: number;
}

interface SplitStats {
  international: { total: number; correct: number; accuracy: number };
  league: { total: number; correct: number; accuracy: number };
}

function StatCard({
  label, value, sub, icon, delay = 0,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="relative bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-6 border border-cricket-800/30 overflow-hidden group hover:border-cricket-600/30 transition-colors"
    >
      <div className="absolute top-4 right-4 text-gray-700 group-hover:text-gray-500 transition-colors">
        {icon}
      </div>
      <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-semibold">{label}</p>
      <motion.p
        className="text-3xl font-black text-white mt-2"
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, delay: 0.3 + delay }}
      >
        {value}
      </motion.p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </motion.div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [split, setSplit] = useState<SplitStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboardStats(), getAccuracyBySplit()])
      .then(([s, sp]) => { setStats(s); setSplit(sp); })
      .catch((err) => console.error('Failed to load stats:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CricketLoader />;

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">
          <span className="text-cricket-400">Dashboard</span>
        </h1>
        <p className="text-gray-500 mb-8 text-sm">Prediction accuracy and model performance</p>
      </motion.div>

      {stats && (
        <>
          {/* Top 3 stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <StatCard
              label="Overall Accuracy"
              value={`${(stats.accuracy * 100).toFixed(1)}%`}
              sub={`${stats.correct} / ${stats.total} correct`}
              icon={<TargetIcon className="w-6 h-6" />}
              delay={0}
            />
            <StatCard
              label="Avg Brier Score"
              value={stats.avgBrier.toFixed(4)}
              sub="Lower is better"
              icon={<BarChartIcon className="w-6 h-6" />}
              delay={0.1}
            />
            <StatCard
              label="Total Predictions"
              value={stats.total.toString()}
              sub="All time"
              icon={<BowlIcon className="w-6 h-6" />}
              delay={0.2}
            />
          </div>

          {/* Split accuracy row */}
          {split && (
            <div className="grid grid-cols-2 gap-5 mb-10">
              <StatCard
                label="International Accuracy"
                value={split.international.total > 0 ? `${Math.round(split.international.accuracy * 100)}%` : '—'}
                sub={split.international.total > 0 ? `${split.international.correct}/${split.international.total} · higher confidence` : 'No data yet'}
                icon={<GlobeIcon className="w-6 h-6" />}
                delay={0.3}
              />
              <StatCard
                label="League Accuracy"
                value={split.league.total > 0 ? `${Math.round(split.league.accuracy * 100)}%` : '—'}
                sub={split.league.total > 0 ? `${split.league.correct}/${split.league.total} · limited data` : 'No data yet'}
                icon={<ShieldIcon className="w-6 h-6" />}
                delay={0.4}
              />
            </div>
          )}
        </>
      )}

      <AccuracyDashboard />
    </div>
  );
}

