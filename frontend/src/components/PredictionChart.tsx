'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface PredictionChartProps {
  team1: string;
  team2: string;
  team1Prob: number;
  team2Prob: number;
}

export function PredictionChart({ team1, team2, team1Prob, team2Prob }: PredictionChartProps) {
  const data = [
    { name: team1, value: team1Prob * 100 },
    { name: team2, value: team2Prob * 100 },
  ];

  const COLORS = ['#22c55e', '#16a34a'];

  return (
    <div className="w-64 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
            labelLine={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => `${value.toFixed(1)}%`}
            contentStyle={{ backgroundColor: '#14532d', border: 'none', borderRadius: '8px' }}
            labelStyle={{ color: '#86efac' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
