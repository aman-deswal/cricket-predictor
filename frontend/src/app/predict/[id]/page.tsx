'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getPrediction, Prediction } from '@/lib/supabase';
import { PredictionChart } from '@/components/PredictionChart';

export default function PredictPage() {
  const params = useParams();
  const matchId = params.id as string;
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getPrediction(matchId);
        setPrediction(data);
      } catch (err) {
        console.error('Failed to load prediction:', err);
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

  if (!prediction) {
    return (
      <div className="text-center text-gray-500 py-16">
        <p className="text-xl">Prediction not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-cricket-300 mb-2">
        {prediction.team1} vs {prediction.team2}
      </h1>
      <p className="text-gray-400 mb-8">Match prediction details</p>

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
    </div>
  );
}
