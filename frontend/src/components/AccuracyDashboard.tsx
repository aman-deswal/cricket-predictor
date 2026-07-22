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
} from 'recharts';
import { getAccuracyTrend, getCalibrationData } from '@/lib/supabase';

interface CalibrationBin {
  bin_center: number;
  predicted_avg: number;
  actual_avg: number;
  count: number;
}

export function AccuracyDashboard() {
  const [calibrationData, setCalibrationData] = useState<CalibrationBin[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; accuracy: number }[]>([]);

  useEffect(() => {
    async function loadCalibration() {
      const data = await getCalibrationData();
      setCalibrationData(data);
    }

    async function loadTrend() {
      const trend = await getAccuracyTrend();
      setTrendData(trend);
    }

    loadCalibration();
    loadTrend();
  }, []);

  return (
    <div className="space-y-8">
      {/* Accuracy Trend */}
      <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800">
        <h3 className="text-lg font-medium text-cricket-300 mb-4">Accuracy Trend (Rolling 10)</h3>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#166534" />
              <XAxis dataKey="date" stroke="#86efac" fontSize={12} />
              <YAxis stroke="#86efac" fontSize={12} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#14532d', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#86efac' }}
              />
              <Line
                type="monotone"
                dataKey="accuracy"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">Not enough data for trend</p>
        )}
      </div>

      {/* Calibration Chart */}
      <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800">
        <h3 className="text-lg font-medium text-cricket-300 mb-4">Calibration Plot</h3>
        {calibrationData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#166534" />
              <XAxis
                dataKey="predicted_avg"
                stroke="#86efac"
                fontSize={12}
                label={{ value: 'Predicted Probability', position: 'bottom', fill: '#86efac' }}
                domain={[0.5, 1]}
              />
              <YAxis
                dataKey="actual_avg"
                stroke="#86efac"
                fontSize={12}
                label={{ value: 'Actual Win Rate', angle: -90, position: 'left', fill: '#86efac' }}
                domain={[0, 1]}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#14532d', border: 'none', borderRadius: '8px' }}
                formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
              />
              <Scatter data={calibrationData} fill="#22c55e" />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">
            Need 50+ predictions for calibration chart
          </p>
        )}
      </div>
    </div>
  );
}
