import { Match, Prediction } from '@/lib/supabase';

interface MatchCardProps {
  match: Match;
  prediction: Prediction | null;
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
    <div className="flex justify-center gap-1 mb-2" aria-label={`Recent form ${form.join(' ')}`}>
      {form.slice(-10).map((result, index) => (
        <span
          key={`${result}-${index}`}
          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${
            result === 'W' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {result}
        </span>
      ))}
    </div>
  );
}

export function MatchCard({ match, prediction }: MatchCardProps) {
  return (
    <a
      href={`/predict?id=${encodeURIComponent(match.match_id)}`}
      className="block bg-cricket-900/50 rounded-xl p-6 border border-cricket-800 hover:border-cricket-600 transition-colors"
    >
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-medium text-cricket-400 uppercase tracking-wide">
          {match.match_type}
        </span>
        <span className="text-xs text-gray-500">
          {new Date(match.date).toLocaleDateString()}
        </span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="text-center flex-1">
          <FormStrip form={match.team1_recent_form} />
          <p className="font-semibold text-white">{match.team1}</p>
          {prediction && (
            <p className="text-sm text-cricket-400 mt-1">
              {(prediction.team1_win_probability * 100).toFixed(0)}%
            </p>
          )}
        </div>
        <span className="text-gray-600 font-bold mx-4">vs</span>
        <div className="text-center flex-1">
          <FormStrip form={match.team2_recent_form} />
          <p className="font-semibold text-white">{match.team2}</p>
          {prediction && (
            <p className="text-sm text-cricket-400 mt-1">
              {(prediction.team2_win_probability * 100).toFixed(0)}%
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 truncate">{getMatchDescriptor(match)}</p>

      {prediction && (
        <div className="mt-4 pt-3 border-t border-cricket-800/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Predicted winner:</span>
            <span className="text-sm font-medium text-cricket-300">
              {prediction.predicted_winner}
            </span>
          </div>
        </div>
      )}
    </a>
  );
}
