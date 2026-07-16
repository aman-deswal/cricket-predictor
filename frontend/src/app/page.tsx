'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getMatchSection, getUpcomingMatches, MatchSection, MatchWithPredictions } from '@/lib/supabase';
import { MatchCard } from '@/components/MatchCard';

const SECTIONS: MatchSection[] = ['International', 'League', 'Other'];

export default function HomePage() {
  const [matches, setMatches] = useState<MatchWithPredictions[]>([]);
  const [loading, setLoading] = useState(true);

  const matchesBySection = SECTIONS.map((section) => ({
    section,
    matches: matches
      .filter((match) => getMatchSection(match) === section)
      .sort((a, b) => {
        // Matches with predictions (most popular) come first
        const aScore = a.predictions?.length ? 1 : 0;
        const bScore = b.predictions?.length ? 1 : 0;
        return bScore - aScore;
      }),
  })).filter(({ matches }) => matches.length > 0);

  useEffect(() => {
    async function load() {
      try {
        const data = await getUpcomingMatches();
        setMatches(data);
      } catch (err) {
        console.error('Failed to load matches:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          className="rounded-full h-10 w-10 border-2 border-cricket-400 border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-4xl font-black text-white mb-8 tracking-tight">
          Up <span className="text-cricket-400">Next</span>
        </h1>
      </motion.div>

      {matches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-gray-500 py-20 bg-gradient-to-br from-gray-900/50 to-cricket-950/50 rounded-2xl border border-gray-800/30"
        >
          <motion.p
            className="text-5xl mb-4"
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            🏏
          </motion.p>
          <p className="text-lg font-medium text-gray-400">No upcoming matches</p>
          <p className="mt-1 text-sm">Check back later for new fixtures</p>
        </motion.div>
      ) : (
        <div className="space-y-12">
          {matchesBySection.map(({ section, matches: sectionMatches }, sectionIdx) => (
            <motion.section
              key={section}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIdx * 0.15 }}
            >
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-lg font-bold text-white">{section}</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-cricket-800/50 to-transparent" />
                <span className="text-xs text-gray-600 font-medium">{sectionMatches.length} match{sectionMatches.length > 1 ? 'es' : ''}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sectionMatches.map((match, idx) => (
                  <MatchCard
                    key={match.match_id}
                    match={match}
                    prediction={match.predictions?.[0] ?? null}
                    index={idx}
                    hot={sectionIdx === 0 && idx === 0}
                  />
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      )}
    </div>
  );
}
