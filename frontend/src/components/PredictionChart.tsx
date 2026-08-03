'use client';

import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { getTeamMeta } from '@/lib/teams';

interface PredictionChartProps {
  team1: string;
  team2: string;
  team1Prob: number;
  team2Prob: number;
  compact?: boolean;
}

export function PredictionChart({ team1, team2, team1Prob, team2Prob, compact = false }: PredictionChartProps) {
  const team1Meta = getTeamMeta(team1);
  const team2Meta = getTeamMeta(team2);

  const data = [
    { name: team1, value: team1Prob * 100 },
    { name: team2, value: team2Prob * 100 },
  ];

  // Ensure chart colors are visually distinct — if primary colors are too similar, use secondary
  const colorDistance = (c1: string, c2: string) => {
    const hex = (s: string) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
    const [r1,g1,b1] = hex(c1);
    const [r2,g2,b2] = hex(c2);
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
  };
  const c1 = team1Meta.primaryColor;
  const c2raw = team2Meta.primaryColor;
  const c2 = colorDistance(c1, c2raw) < 80 ? team2Meta.secondaryColor : c2raw;
  const COLORS = [c1, c2];
  const isTossUp = Math.abs(team1Prob - team2Prob) < 0.005;
  const winner = team1Prob > team2Prob ? team1 : team2;
  const winnerProb = Math.max(team1Prob, team2Prob);

  if (compact) {
    return (
      <motion.div
        className="relative w-full h-full"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 100, delay: 0.2 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              <filter id="compact-glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
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
              innerRadius="50%"
              outerRadius="85%"
              paddingAngle={4}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
              animationBegin={300}
              animationDuration={1000}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index]}
                  style={{ filter: 'url(#compact-glow)' }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center percentage */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs sm:text-sm font-black text-white drop-shadow-lg">
            {isTossUp ? '50/50' : `${(winnerProb * 100).toFixed(0)}%`}
          </span>
        </div>
      </motion.div>
    );
  }

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
          {isTossUp ? '50/50' : `${(winnerProb * 100).toFixed(0)}%`}
        </p>
        <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">
          {isTossUp ? 'Toss-up' : `${getTeamMeta(winner).shortName} wins`}
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
