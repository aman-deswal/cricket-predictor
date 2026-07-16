'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getTeamMeta } from '@/lib/teams';

interface TossImpactProps {
  team1: string;
  team2: string;
  team1Prob: number;
  team2Prob: number;
  onAdjustedProbabilities?: (team1Prob: number, team2Prob: number) => void;
}

// Toss impact modifiers based on cricket analytics
const TOSS_MODIFIERS = {
  bat_first: 0.07,   // Winning toss + batting first gives ~7% edge
  bowl_first: 0.05,  // Winning toss + bowling first gives ~5% edge (slightly less in most formats)
};

export function TossImpact({ team1, team2, team1Prob, team2Prob, onAdjustedProbabilities }: TossImpactProps) {
  const [tossWinner, setTossWinner] = useState<string | null>(null);
  const [decision, setDecision] = useState<'bat' | 'bowl' | null>(null);

  const team1Meta = getTeamMeta(team1);
  const team2Meta = getTeamMeta(team2);

  const getAdjustedProbabilities = () => {
    if (!tossWinner || !decision) return { p1: team1Prob, p2: team2Prob };

    const modifier = decision === 'bat' ? TOSS_MODIFIERS.bat_first : TOSS_MODIFIERS.bowl_first;
    let p1 = team1Prob;
    let p2 = team2Prob;

    if (tossWinner === team1) {
      p1 = Math.min(0.95, p1 + modifier);
      p2 = Math.max(0.05, 1 - p1);
    } else {
      p2 = Math.min(0.95, p2 + modifier);
      p1 = Math.max(0.05, 1 - p2);
    }

    return { p1, p2 };
  };

  const { p1, p2 } = getAdjustedProbabilities();
  const isAdjusted = tossWinner !== null && decision !== null;
  const diff1 = ((p1 - team1Prob) * 100).toFixed(0);
  const diff2 = ((p2 - team2Prob) * 100).toFixed(0);

  // Notify parent of adjusted probabilities
  if (onAdjustedProbabilities && isAdjusted) {
    onAdjustedProbabilities(p1, p2);
  }

  const handleTossSelect = (team: string | null) => {
    setTossWinner(team);
    if (!team) setDecision(null);
  };

  return (
    <motion.div
      className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">🪙</span>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">Simulate Toss</h2>
        </div>
        {isAdjusted && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
          >
            Toss Adjusted
          </motion.span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Toss winner selector */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500 mr-1">Winner:</span>
          {[
            { team: team1, meta: team1Meta },
            { team: team2, meta: team2Meta },
          ].map(({ team, meta }) => (
            <button
              key={team}
              onClick={() => handleTossSelect(tossWinner === team ? null : team)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                tossWinner === team
                  ? 'bg-cricket-500/30 text-white border border-cricket-400/50 shadow-sm'
                  : 'bg-gray-800/50 text-gray-400 border border-gray-700/30 hover:border-gray-600/50'
              }`}
            >
              {meta.shortName}
            </button>
          ))}
        </div>

        {/* Decision selector — only show when toss winner selected */}
        <AnimatePresence>
          {tossWinner && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-1"
            >
              <span className="text-[10px] text-gray-500 mx-1">→</span>
              <button
                onClick={() => setDecision(decision === 'bat' ? null : 'bat')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                  decision === 'bat'
                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50'
                    : 'bg-gray-800/50 text-gray-400 border border-gray-700/30 hover:border-gray-600/50'
                }`}
              >
                🏏 Bat First
              </button>
              <button
                onClick={() => setDecision(decision === 'bowl' ? null : 'bowl')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                  decision === 'bowl'
                    ? 'bg-blue-500/30 text-blue-300 border border-blue-400/50'
                    : 'bg-gray-800/50 text-gray-400 border border-gray-700/30 hover:border-gray-600/50'
                }`}
              >
                🎳 Bowl First
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Adjusted probabilities display */}
      <AnimatePresence>
        {isAdjusted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 pt-3 border-t border-gray-800/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-xs font-bold text-white">{(p1 * 100).toFixed(0)}%</p>
                  <p className="text-[9px] text-gray-500">{team1Meta.shortName}</p>
                </div>
                {/* Mini probability bar */}
                <div className="w-32 h-2 rounded-full overflow-hidden bg-gray-800 flex">
                  <motion.div
                    className="h-full rounded-l-full"
                    style={{ backgroundColor: team1Meta.primaryColor }}
                    initial={{ width: `${team1Prob * 100}%` }}
                    animate={{ width: `${p1 * 100}%` }}
                    transition={{ type: 'spring', stiffness: 100 }}
                  />
                  <motion.div
                    className="h-full rounded-r-full"
                    style={{ backgroundColor: team2Meta.primaryColor }}
                    initial={{ width: `${team2Prob * 100}%` }}
                    animate={{ width: `${p2 * 100}%` }}
                    transition={{ type: 'spring', stiffness: 100 }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-white">{(p2 * 100).toFixed(0)}%</p>
                  <p className="text-[9px] text-gray-500">{team2Meta.shortName}</p>
                </div>
              </div>

              {/* Shift indicator */}
              <div className="text-[9px] text-gray-500">
                <span className={Number(diff1) > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {Number(diff1) > 0 ? '+' : ''}{diff1}%
                </span>
                {' / '}
                <span className={Number(diff2) > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {Number(diff2) > 0 ? '+' : ''}{diff2}%
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
