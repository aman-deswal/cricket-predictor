'use client';

import { motion } from 'framer-motion';
import { getTeamMeta } from '@/lib/teams';

interface TossImpactProps {
  team1: string;
  team2: string;
  team1Prob: number;
  team2Prob: number;
  onAdjustedProbabilities?: (team1Prob: number, team2Prob: number) => void;
}

const TOSS_MODIFIERS = {
  bat_first: 0.07,
  bowl_first: 0.05,
};

function adjust(baseProb: number, modifier: number): number {
  return Math.min(0.95, Math.max(0.05, baseProb + modifier));
}

export function TossImpact({ team1, team2, team1Prob, team2Prob }: TossImpactProps) {
  const team1Meta = getTeamMeta(team1);
  const team2Meta = getTeamMeta(team2);

  // Pre-compute all 4 scenarios
  const scenarios = [
    {
      label: `${team1Meta.shortName} wins toss → Bat`,
      icon: 'BAT',
      p1: adjust(team1Prob, TOSS_MODIFIERS.bat_first),
    },
    {
      label: `${team1Meta.shortName} wins toss → Bowl`,
      icon: 'BWL',
      p1: adjust(team1Prob, TOSS_MODIFIERS.bowl_first),
    },
    {
      label: `${team2Meta.shortName} wins toss → Bat`,
      icon: 'BAT',
      p1: adjust(team1Prob, -TOSS_MODIFIERS.bat_first),
    },
    {
      label: `${team2Meta.shortName} wins toss → Bowl`,
      icon: 'BWL',
      p1: adjust(team1Prob, -TOSS_MODIFIERS.bowl_first),
    },
  ].map(s => ({ ...s, p2: Math.max(0.05, Math.min(0.95, 1 - s.p1)) }));

  return (
    <motion.div
      className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M5 6h6M5 10h6" /></svg>
        <h2 className="text-xs font-bold text-white uppercase tracking-wider">Toss Scenarios</h2>
      </div>

      <div className="space-y-2">
        {scenarios.map((s, i) => {
          const diff1 = ((s.p1 - team1Prob) * 100).toFixed(0);
          return (
            <motion.div
              key={i}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <span className="text-[9px] font-bold text-gray-500 w-6">{s.icon}</span>
              <span className="text-[10px] text-gray-400 flex-1 min-w-0 truncate">{s.label}</span>

              {/* Probability bar */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-mono font-bold text-white w-8 text-right">
                  {(s.p1 * 100).toFixed(0)}%
                </span>
                <div className="w-20 sm:w-28 h-2 rounded-full overflow-hidden bg-gray-800 flex">
                  <div
                    className="h-full rounded-l-full transition-all duration-500"
                    style={{ width: `${s.p1 * 100}%`, backgroundColor: team1Meta.primaryColor }}
                  />
                  <div
                    className="h-full rounded-r-full transition-all duration-500"
                    style={{ width: `${s.p2 * 100}%`, backgroundColor: team2Meta.primaryColor }}
                  />
                </div>
                <span className="text-[10px] font-mono font-bold text-white w-8">
                  {(s.p2 * 100).toFixed(0)}%
                </span>
              </div>

              <span className={`text-[9px] font-semibold w-7 text-right flex-shrink-0 ${Number(diff1) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {Number(diff1) > 0 ? '+' : ''}{diff1}%
              </span>
            </motion.div>
          );
        })}
      </div>

      <p className="text-[9px] text-gray-600 mt-2 text-center">
        {team1Meta.shortName} / {team2Meta.shortName} win% shift based on toss outcome
      </p>
    </motion.div>
  );
}
