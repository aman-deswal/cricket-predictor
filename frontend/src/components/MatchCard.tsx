'use client';

import { motion } from 'framer-motion';
import { Match, Prediction } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';

interface MatchCardProps {
  match: Match;
  prediction: Prediction | null;
  index?: number;
}

function getMatchDescriptor(match: Match): string {
  if (match.name?.includes(',')) {
    return match.name.split(',').slice(1).join(',').trim();
  }
  return match.name || match.venue;
}

function FormStrip({ form }: { form?: Array<'W' | 'L'> }) {
  if (!form || form.length === 0) return null;

  return (
    <div className="flex justify-center gap-0.5 mb-2" aria-label={`Recent form ${form.join(' ')}`}>
      {form.slice(-5).map((result, index) => (
        <motion.span
          key={`${result}-${index}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.05 }}
          className={`flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold text-white ${
            result === 'W' ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        >
          {result}
        </motion.span>
      ))}
    </div>
  );
}

function ProbabilityBar({ team1Prob }: { team1Prob: number }) {
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-cricket-400 to-emerald-400"
        initial={{ width: 0 }}
        animate={{ width: `${team1Prob * 100}%` }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
      />
    </div>
  );
}

export function MatchCard({ match, prediction, index = 0 }: MatchCardProps) {
  const team1Meta = getTeamMeta(match.team1);
  const team2Meta = getTeamMeta(match.team2);
  const winner = prediction?.predicted_winner;

  return (
    <motion.a
      href={`/predict?id=${encodeURIComponent(match.match_id)}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="block relative group"
    >
      {/* Glow effect on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-cricket-500/0 to-emerald-500/0 group-hover:from-cricket-500/20 group-hover:to-emerald-500/20 rounded-2xl blur-sm transition-all duration-300" />

      <div className="relative bg-gradient-to-br from-gray-900/90 to-cricket-950/90 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/50 group-hover:border-cricket-600/50 transition-all duration-300 overflow-hidden">
        {/* Subtle shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] font-semibold text-cricket-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-cricket-400/10">
            {match.match_type}
          </span>
          <span className="text-[10px] text-gray-500 font-medium">
            {new Date(match.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </span>
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between gap-3 mb-4">
          {/* Team 1 */}
          <div className="flex-1 text-center">
            <FormStrip form={match.team1_recent_form} />
            <motion.div
              className="w-10 h-10 mx-auto mb-2 rounded-full overflow-hidden ring-2 ring-offset-1 ring-offset-cricket-950 shadow-md"
              style={{ ['--tw-ring-color' as string]: winner === match.team1 ? team1Meta.primaryColor : 'rgba(75, 85, 99, 0.4)' }}
              whileHover={{ scale: 1.15 }}
            >
              <img
                src={getFlagUrl(team1Meta.countryCode, 48)}
                srcSet={`${getFlag2xUrl(team1Meta.countryCode, 48)} 2x`}
                alt={match.team1}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </motion.div>
            <p className="font-bold text-white text-sm">{team1Meta.shortName}</p>
            {prediction && (
              <motion.p
                className={`text-xs font-semibold mt-0.5 ${winner === match.team1 ? 'text-cricket-300' : 'text-gray-500'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {(prediction.team1_win_probability * 100).toFixed(0)}%
              </motion.p>
            )}
          </div>

          {/* VS divider */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">vs</span>
          </div>

          {/* Team 2 */}
          <div className="flex-1 text-center">
            <FormStrip form={match.team2_recent_form} />
            <motion.div
              className="w-10 h-10 mx-auto mb-2 rounded-full overflow-hidden ring-2 ring-offset-1 ring-offset-cricket-950 shadow-md"
              style={{ ['--tw-ring-color' as string]: winner === match.team2 ? team2Meta.primaryColor : 'rgba(75, 85, 99, 0.4)' }}
              whileHover={{ scale: 1.15 }}
            >
              <img
                src={getFlagUrl(team2Meta.countryCode, 48)}
                srcSet={`${getFlag2xUrl(team2Meta.countryCode, 48)} 2x`}
                alt={match.team2}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </motion.div>
            <p className="font-bold text-white text-sm">{team2Meta.shortName}</p>
            {prediction && (
              <motion.p
                className={`text-xs font-semibold mt-0.5 ${winner === match.team2 ? 'text-cricket-300' : 'text-gray-500'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {(prediction.team2_win_probability * 100).toFixed(0)}%
              </motion.p>
            )}
          </div>
        </div>

        {/* Probability bar */}
        {prediction && (
          <ProbabilityBar team1Prob={prediction.team1_win_probability} />
        )}

        {/* Footer */}
        <p className="text-[10px] text-gray-500 truncate mt-3">{getMatchDescriptor(match)}</p>

        {prediction && (
          <motion.div
            className="mt-3 pt-3 border-t border-gray-800/50 flex items-center justify-between"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Predicted</span>
            <span className="text-xs font-bold text-cricket-300">
              {prediction.predicted_winner}
            </span>
          </motion.div>
        )}
      </div>
    </motion.a>
  );
}
