'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { CricketLoader } from '@/components/CricketLoader';
import { getDashboardStats, getAccuracyBySplit } from '@/lib/supabase';
import { TargetIcon, BarChartIcon, BowlIcon, GlobeIcon, ShieldIcon } from '@/components/CricketIcons';

const AccuracyDashboard = dynamic(
  () => import('@/components/AccuracyDashboard').then((module) => module.AccuracyDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6" aria-label="Loading performance charts">
        {['Accuracy trend', 'Calibration plot'].map((label) => (
          <div key={label} className="rounded-2xl border border-slate-700/40 bg-[#10161d] p-4 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <div className="mt-5 h-56 animate-pulse rounded-xl bg-white/[0.03] sm:h-[260px]" />
          </div>
        ))}
      </div>
    ),
  }
);

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
      className="group relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-br from-[#121922]/90 to-[#0c1218]/90 p-4 transition-colors hover:border-amber-600/30 sm:p-6 sm:backdrop-blur-xl"
    >
      <div className="absolute top-4 right-4 text-slate-600 group-hover:text-slate-400 transition-colors">
        {icon}
      </div>
      <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold">{label}</p>
      <motion.p
        className="text-3xl font-black text-white mt-2"
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, delay: 0.3 + delay }}
      >
        {value}
      </motion.p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
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
        <h1 className="mb-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          <span className="text-amber-600">Dashboard</span>
        </h1>
        <p className="mb-6 text-sm text-slate-500 sm:mb-8">Prediction accuracy and model performance</p>
      </motion.div>

      {stats && (
        <>
          {/* Top 3 stat cards */}
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
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
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 sm:mb-10">
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
