'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
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

function FormStrip({ form, align = 'center' }: { form?: Array<'W' | 'L'>; align?: 'left' | 'center' | 'right' }) {
  if (!form || form.length === 0) return null;
  const recent = form.slice(-5);
  const wins = recent.filter(r => r === 'W').length;
  const alignClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';

  return (
    <div className={`flex ${alignClass} gap-0.5 mb-1.5`} aria-label={`Recent form: ${wins}W ${recent.length - wins}L`}>
      {recent.map((result, index) => (
        <motion.span
          key={`${result}-${index}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.04 }}
          className={`flex h-[14px] w-[14px] items-center justify-center rounded-[3px] text-[8px] font-bold text-white ${
            result === 'W' ? 'bg-emerald-500/90' : 'bg-red-500/80'
          }`}
        >
          {result}
        </motion.span>
      ))}
    </div>
  );
}

function ProbabilityBar({ team1Prob, team1Color, team2Color }: { team1Prob: number; team1Color: string; team2Color: string }) {
  return (
    <div className="w-full h-1.5 bg-gray-800/50 rounded-full overflow-hidden flex">
      <motion.div
        className="h-full rounded-l-full"
        style={{ backgroundColor: team1Color }}
        initial={{ width: 0 }}
        animate={{ width: `${team1Prob * 100}%` }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
      />
      <motion.div
        className="h-full rounded-r-full"
        style={{ backgroundColor: team2Color }}
        initial={{ width: 0 }}
        animate={{ width: `${(1 - team1Prob) * 100}%` }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
      />
    </div>
  );
}

function toAmericanOdds(probability: number): string {
  if (probability <= 0 || probability >= 1) return '-';
  if (probability >= 0.5) {
    return Math.round(-100 * probability / (1 - probability)).toString();
  } else {
    return '+' + Math.round(100 * (1 - probability) / probability).toString();
  }
}

function getMatchTime(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function MatchCard({ match, prediction, index = 0 }: MatchCardProps) {
  const team1Meta = getTeamMeta(match.team1);
  const team2Meta = getTeamMeta(match.team2);
  const winner = prediction?.predicted_winner;

  return (
    <Link href={`/predict?id=${encodeURIComponent(match.match_id)}`} className="block relative group">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      whileHover={{ y: -4, scale: 1.02 }}
    >
      {/* Glow effect on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-cricket-500/0 to-amber-500/0 group-hover:from-cricket-500/20 group-hover:to-amber-500/20 rounded-2xl blur-sm transition-all duration-300" />

      <div className="relative bg-gradient-to-br from-gray-900/90 to-cricket-950/90 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/50 group-hover:border-cricket-600/50 transition-all duration-300 overflow-hidden">
        {/* Subtle shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

        {/* Header: match type + time + venue */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-cricket-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-cricket-400/10 w-fit">
              {match.match_type}
            </span>
            {match.venue && (
              <span className="text-[9px] text-gray-500 pl-0.5 truncate max-w-[140px]">
                📍 {match.venue.split(',')[0]}
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-400 font-medium block">
              {getMatchTime(match.date)}
            </span>
            <span className="text-[9px] text-gray-600">
              {new Date(match.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Team 1 */}
          <div className="flex-1 text-center">
            <FormStrip form={match.team1_recent_form} />
            <motion.div
              className="w-10 h-10 mx-auto mb-1.5 rounded-full overflow-hidden ring-2 ring-offset-1 ring-offset-cricket-950 shadow-md"
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
              className="w-10 h-10 mx-auto mb-1.5 rounded-full overflow-hidden ring-2 ring-offset-1 ring-offset-cricket-950 shadow-md"
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

        {/* Probability bar - team colored */}
        {prediction && (
          <ProbabilityBar
            team1Prob={prediction.team1_win_probability}
            team1Color={team1Meta.primaryColor}
            team2Color={team2Meta.primaryColor}
          />
        )}

        {/* Footer: series + odds */}
        <div className="mt-3 pt-3 border-t border-gray-800/50">
          <p className="text-[10px] text-gray-500 truncate">{getMatchDescriptor(match)}</p>

          {prediction && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">AI Odds</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono font-semibold text-gray-300">
                  {team1Meta.shortName}{' '}
                  <span className="text-cricket-400">{toAmericanOdds(prediction.team1_win_probability)}</span>
                </span>
                <span className="text-gray-700">|</span>
                <span className="text-[11px] font-mono font-semibold text-gray-300">
                  {team2Meta.shortName}{' '}
                  <span className="text-cricket-400">{toAmericanOdds(prediction.team2_win_probability)}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
    </Link>
  );
}
