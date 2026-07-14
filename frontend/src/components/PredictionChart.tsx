'use client';

import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { getTeamMeta } from '@/lib/teams';

interface PredictionChartProps {
  team1: string;
  team2: string;
  team1Prob: number;
  team2Prob: number;
}

export function PredictionChart({ team1, team2, team1Prob, team2Prob }: PredictionChartProps) {
  const team1Meta = getTeamMeta(team1);
  const team2Meta = getTeamMeta(team2);

  const data = [
    { name: team1, value: team1Prob * 100 },
    { name: team2, value: team2Prob * 100 },
  ];

  const COLORS = [team1Meta.primaryColor, team2Meta.primaryColor];
  const winner = team1Prob > team2Prob ? team1 : team2;
  const winnerProb = Math.max(team1Prob, team2Prob);

  return (
    <motion.div
      className="relative w-72 h-72"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 100, delay: 0.2 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={75}
            outerRadius={110}
            paddingAngle={3}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
            animationBegin={300}
            animationDuration={1200}
            animationEasing="ease-out"
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index]}
                style={{ filter: 'url(#glow)' }}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Center content */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <p className="text-3xl font-black text-white">
          {(winnerProb * 100).toFixed(0)}%
        </p>
        <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">
          {getTeamMeta(winner).shortName} wins
        </p>
      </motion.div>

      {/* Legend */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team1Meta.primaryColor }} />
          <span className="text-gray-400">{team1Meta.shortName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team2Meta.primaryColor }} />
          <span className="text-gray-400">{team2Meta.shortName}</span>
        </div>
      </div>
    </motion.div>
  );
}
