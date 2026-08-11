'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from 'recharts';
import { getAccuracyTrend, getCalibrationData } from '@/lib/supabase';

interface CalibrationBin {
  bin_center: number;
  predicted_avg: number;
  actual_avg: number;
  count: number;
}

// Shared muted-gold palette — matches the rest of the app
const GRID   = '#1f2937';
const AXIS   = '#94a3b8';
const LABEL  = '#d97706';
const LINE   = '#f59e0b';
const DOTS   = '#fbbf24';
const TT_BG  = '#111820';
const TT_BORDER = 'rgba(217,119,6,0.16)';

export function AccuracyDashboard() {
  const [calibrationData, setCalibrationData] = useState<CalibrationBin[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; accuracy: number }[]>([]);

  useEffect(() => {
    getCalibrationData().then(setCalibrationData);
    getAccuracyTrend().then(setTrendData);
  }, []);

  const cardClass =
    'bg-gradient-to-br from-[#121922]/90 to-[#0c1218]/90 sm:backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-slate-700/40';

  return (
    <div className="space-y-6">
      {/* Accuracy Trend */}
      <div className={cardClass}>
        <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-1">
          Accuracy Trend
        </h3>
        <p className="text-[10px] text-slate-500 mb-5">Rolling 10-match window</p>
        {trendData.length > 0 ? (
          <div className="h-56 sm:h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID} strokeOpacity={0.8} />
              <XAxis dataKey="date" stroke={AXIS} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} />
              <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} domain={[0, 100]} />
              <ReferenceLine y={50} stroke={AXIS} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip
                contentStyle={{
                  backgroundColor: TT_BG,
                  border: `1px solid ${TT_BORDER}`,
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                }}
                labelStyle={{ color: LABEL, fontWeight: 700 }}
                itemStyle={{ color: DOTS }}
                formatter={(v: number) => [`${v.toFixed(1)}%`, 'Accuracy']}
              />
              <Line
                type="monotone"
                dataKey="accuracy"
                stroke={LINE}
                strokeWidth={2.5}
                dot={{ fill: DOTS, strokeWidth: 0, r: 3 }}
                activeDot={{ fill: LABEL, r: 5, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-10 text-sm">Not enough data for trend yet</p>
        )}
      </div>

      {/* Calibration Chart */}
      <div className={cardClass}>
        <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-1">
          Calibration Plot
        </h3>
        <p className="text-[10px] text-slate-500 mb-5">
          Dots on the diagonal = perfect model confidence. Dots above = model underestimates.
        </p>
        {calibrationData.length > 0 ? (
          <div className="h-56 sm:h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 4, right: 8, bottom: 20, left: -12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID} strokeOpacity={0.8} />
              <XAxis
                dataKey="predicted_avg"
                stroke={AXIS}
                tick={{ fill: AXIS, fontSize: 10 }}
                tickLine={false}
                label={{ value: 'Predicted prob.', position: 'insideBottom', offset: -12, fill: AXIS, fontSize: 9 }}
                domain={[0.5, 1]}
              />
              <YAxis
                dataKey="actual_avg"
                stroke={AXIS}
                tick={{ fill: AXIS, fontSize: 10 }}
                tickLine={false}
                label={{ value: 'Actual win rate', angle: -90, position: 'insideLeft', offset: 16, fill: AXIS, fontSize: 9 }}
                domain={[0, 1]}
              />
              {/* Perfect calibration diagonal */}
              <ReferenceLine segment={[{ x: 0.5, y: 0.5 }, { x: 1, y: 1 }]}
                stroke={AXIS} strokeDasharray="4 4" strokeOpacity={0.4} />
              <Tooltip
                contentStyle={{
                  backgroundColor: TT_BG,
                  border: `1px solid ${TT_BORDER}`,
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                }}
                labelStyle={{ color: LABEL }}
                itemStyle={{ color: DOTS }}
                formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              />
              <Scatter data={calibrationData} fill={DOTS} opacity={0.85} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-10 text-sm">
            Need 50+ predictions for calibration chart
          </p>
        )}
      </div>
    </div>
  );
}
