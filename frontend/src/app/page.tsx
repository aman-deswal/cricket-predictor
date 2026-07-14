'use client';

import { useEffect, useState } from 'react';
import { getUpcomingMatches, Match, Prediction } from '@/lib/supabase';
import { MatchCard } from '@/components/MatchCard';

type MatchWithPrediction = Match & { predictions: Prediction[] };

export default function HomePage() {
  const [matches, setMatches] = useState<MatchWithPrediction[]>([]);
  const [loading, setLoading] = useState(true);

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cricket-400" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-cricket-300 mb-2">Upcoming Matches</h1>
      <p className="text-gray-400 mb-8">AI-powered predictions for today&apos;s cricket matches</p>

      {matches.length === 0 ? (
        <div className="text-center text-gray-500 py-16">
          <p className="text-xl">No upcoming matches with predictions</p>
          <p className="mt-2">Check back later for new predictions</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {matches.map((match) => (
            <MatchCard
              key={match.match_id}
              match={match}
              prediction={match.predictions?.[0] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
