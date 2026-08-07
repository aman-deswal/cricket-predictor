'use client';

import { motion } from 'framer-motion';
import { getFlagUrl, getFlag2xUrl, getTeamMeta } from '@/lib/teams';

interface TeamBadgeProps {
  teamName: string;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  probability?: number;
  isWinner?: boolean;
}

const sizeMap = {
  sm: { flag: 32, container: 'w-10 h-10', flagRadius: 'rounded-md', text: 'text-xs', probText: 'text-sm' },
  md: { flag: 48, container: 'w-14 h-14', flagRadius: 'rounded-lg', text: 'text-sm', probText: 'text-lg' },
  lg: { flag: 80, container: 'w-20 h-20', flagRadius: 'rounded-xl', text: 'text-base', probText: 'text-2xl' },
};

export function TeamBadge({ teamName, size = 'md', showName = true, probability, isWinner }: TeamBadgeProps) {
  const meta = getTeamMeta(teamName);
  const { flag, container, flagRadius, text, probText } = sizeMap[size];

  return (
    <motion.div
      className="flex flex-col items-center gap-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className={`${container} ${meta.countryCode ? flagRadius : 'rounded-full'} overflow-hidden ring-2 ring-offset-2 ring-offset-[#111820] shadow-lg`}
        style={{ ['--tw-ring-color' as string]: isWinner ? meta.primaryColor : 'rgba(217, 119, 6, 0.28)' }}
        whileHover={{ scale: 1.1 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        {meta.countryCode ? (
          <img
            src={getFlagUrl(meta.countryCode, flag)}
            srcSet={`${getFlag2xUrl(meta.countryCode, flag)} 2x`}
            alt={`${meta.name} flag`}
            className={`w-full h-full ${flagRadius} object-cover`}
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-bold text-white"
            style={{ backgroundColor: meta.primaryColor, fontSize: flag * 0.28 }}
          >
            {meta.shortName.slice(0, 3)}
          </div>
        )}
      </motion.div>

      {showName && (
        <div className="text-center">
          <p className={`font-semibold text-white ${text}`}>{meta.shortName}</p>
          <p className="text-[10px] text-slate-400 leading-tight max-w-[80px] truncate">{teamName}</p>
        </div>
      )}

      {probability !== undefined && (
        <motion.p
          className={`font-bold ${probText} ${isWinner ? 'text-amber-600' : 'text-slate-400'}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
        >
          {(probability * 100).toFixed(0)}%
        </motion.p>
      )}
    </motion.div>
  );
}
