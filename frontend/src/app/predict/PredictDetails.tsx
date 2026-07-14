'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getMatch, getMatchEnrichment, getPrediction, Match, MatchEnrichment, Prediction } from '@/lib/supabase';
import { PredictionChart } from '@/components/PredictionChart';

export function PredictDetails() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get('id');
  const [match, setMatch] = useState<Match | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [enrichment, setEnrichment] = useState<MatchEnrichment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        const [matchData, predictionData, enrichmentData] = await Promise.all([
          getMatch(matchId),
          getPrediction(matchId),
          getMatchEnrichment(matchId),
        ]);
        setMatch(matchData);
        setPrediction(predictionData);
        setEnrichment(enrichmentData);
      } catch (err) {
        console.error('Failed to load match details:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [matchId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cricket-400" />
      </div>
    );
  }

  if (!matchId || !match) {
    return (
      <div className="text-center text-gray-500 py-16">
        <p className="text-xl">Match not found</p>
      </div>
    );
  }

  const displayTeam1 = prediction?.team1 ?? match.team1;
  const displayTeam2 = prediction?.team2 ?? match.team2;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-cricket-300 mb-2">
        {displayTeam1} vs {displayTeam2}
      </h1>
      <p className="text-gray-400 mb-8">{match.name || 'Match details'}</p>

      <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800 mb-6">
        <h2 className="text-lg font-semibold text-cricket-200 mb-4">Fixture</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 uppercase tracking-wide text-xs mb-1">Format</p>
            <p className="text-gray-200">{match.match_type.toUpperCase()}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wide text-xs mb-1">Start</p>
            <p className="text-gray-200">{new Date(match.date).toLocaleString()}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-gray-500 uppercase tracking-wide text-xs mb-1">Series / Venue</p>
            <p className="text-gray-200">{match.venue || 'TBC'}</p>
          </div>
        </div>
      </div>

      <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800 mb-6">
        <h2 className="text-lg font-semibold text-cricket-200 mb-4">Possible XI</h2>
        {enrichment?.possible_xi && ((enrichment.possible_xi.team1?.length ?? 0) > 0 || (enrichment.possible_xi.team2?.length ?? 0) > 0) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { team: displayTeam1, players: enrichment.possible_xi.team1 ?? [] },
              { team: displayTeam2, players: enrichment.possible_xi.team2 ?? [] },
            ].map(({ team, players }) => (
              <div key={team} className="rounded-lg border border-cricket-800/70 p-4">
                <p className="font-medium text-white mb-2">{team}</p>
                {players.length > 0 ? (
                  <ul className="space-y-1 text-sm text-gray-300">
                    {players.map((player) => <li key={player}>{player}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">No source-backed XI found yet.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Squad and probable XI will appear here once source-backed enrichment is available.</p>
        )}
      </div>

      {enrichment && (
        <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-cricket-200">Research Notes</h2>
            <span className="text-xs uppercase tracking-wide text-gray-500">{enrichment.confidence} confidence</span>
          </div>

          {enrichment.venue_name && (
            <div className="mb-4">
              <p className="text-gray-500 uppercase tracking-wide text-xs mb-1">Venue</p>
              <p className="text-gray-200">{enrichment.venue_name} <span className="text-gray-500">({enrichment.venue_confidence})</span></p>
            </div>
          )}

          {enrichment.expert_preview && (
            <div className="mb-4">
              <p className="text-gray-500 uppercase tracking-wide text-xs mb-1">Expert Preview</p>
              <p className="text-gray-300 leading-relaxed">{enrichment.expert_preview}</p>
            </div>
          )}

          {enrichment.player_updates.length > 0 && (
            <div className="mb-4">
              <p className="text-gray-500 uppercase tracking-wide text-xs mb-2">Player Updates</p>
              <ul className="space-y-2 text-sm text-gray-300">
                {enrichment.player_updates.map((update, index) => (
                  <li key={`${update.player ?? 'update'}-${index}`} className="rounded-lg border border-cricket-800/70 p-3">
                    <span className="font-medium text-white">{update.player ?? update.team ?? 'Update'}:</span> {update.status}
                    {update.confidence && <span className="text-gray-500"> ({update.confidence})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {enrichment.source_links.length > 0 && (
            <div>
              <p className="text-gray-500 uppercase tracking-wide text-xs mb-2">Sources</p>
              <div className="space-y-2">
                {enrichment.source_links.slice(0, 5).map((source, index) => (
                  <a
                    key={`${source.url ?? source.title}-${index}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm text-cricket-300 hover:text-cricket-200"
                  >
                    [{index + 1}] {source.source}: {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!prediction ? (
        <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800 text-center">
          <p className="text-xl font-semibold text-cricket-300">Prediction pending</p>
          <p className="text-gray-400 mt-2">This fixture is loaded. The prediction pipeline has not generated probabilities for it yet.</p>
        </div>
      ) : (
        <>

          <div className="bg-cricket-900/50 rounded-xl p-6 border border-cricket-800 mb-6">
            <div className="flex justify-center mb-6">
              <PredictionChart
                team1={prediction.team1}
                team2={prediction.team2}
                team1Prob={prediction.team1_win_probability}
                team2Prob={prediction.team2_win_probability}
              />
            </div>

            <div className="text-center mb-6">
              <p className="text-sm text-gray-400 uppercase tracking-wide">Predicted Winner</p>
              <p className="text-2xl font-bold text-cricket-300">{prediction.predicted_winner}</p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                prediction.confidence === 'high'
                  ? 'bg-green-900/50 text-green-300'
                  : prediction.confidence === 'medium'
                  ? 'bg-yellow-900/50 text-yellow-300'
                  : 'bg-red-900/50 text-red-300'
              }`}>
                {prediction.confidence} confidence
              </span>
            </div>

            <div className="border-t border-cricket-800 pt-4">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">Reasoning</h3>
              <p className="text-gray-300 leading-relaxed">{prediction.reasoning}</p>
            </div>
          </div>

          <div className="bg-cricket-900/30 rounded-lg p-4 border border-cricket-800/50 text-sm text-gray-500">
            <p>Model: {prediction.model} | Ensemble size: {prediction.ensemble_size}</p>
          </div>
        </>
      )}
    </div>
  );
}