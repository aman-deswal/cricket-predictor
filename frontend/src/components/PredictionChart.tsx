import { getTeamMeta } from '@/lib/teams';

interface PredictionChartProps {
  team1: string;
  team2: string;
  team1Prob: number;
  team2Prob: number;
  compact?: boolean;
}

export function PredictionChart({ team1, team2, team1Prob, team2Prob, compact = false }: PredictionChartProps) {
  const team1Meta = getTeamMeta(team1);
  const team2Meta = getTeamMeta(team2);

  // Ensure chart colors are visually distinct — if primary colors are too similar, use secondary
  const colorDistance = (c1: string, c2: string) => {
    const hex = (s: string) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
    const [r1,g1,b1] = hex(c1);
    const [r2,g2,b2] = hex(c2);
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
  };
  const c1 = team1Meta.primaryColor;
  const c2raw = team2Meta.primaryColor;
  const c2 = colorDistance(c1, c2raw) < 80 ? team2Meta.secondaryColor : c2raw;
  const isTossUp = Math.abs(team1Prob - team2Prob) < 0.005;
  const winner = team1Prob > team2Prob ? team1 : team2;
  const winnerProb = Math.max(team1Prob, team2Prob);

  if (compact) {
    return (
      <div
        className="relative h-full w-full rounded-full p-[12%] shadow-[0_0_24px_rgba(0,0,0,0.25)]"
        style={{
          background: `conic-gradient(${c1} 0 ${team1Prob * 100}%, ${c2} ${team1Prob * 100}% 100%)`,
        }}
        role="img"
        aria-label={`${team1Meta.shortName} ${(team1Prob * 100).toFixed(0)} percent, ${team2Meta.shortName} ${(team2Prob * 100).toFixed(0)} percent`}
      >
        <div className="h-full w-full rounded-full bg-[#10161d]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs sm:text-sm font-black text-white drop-shadow-lg">
            {isTossUp ? '50/50' : `${(winnerProb * 100).toFixed(0)}%`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-72 w-72 rounded-full p-9"
      style={{ background: `conic-gradient(${c1} 0 ${team1Prob * 100}%, ${c2} ${team1Prob * 100}% 100%)` }}
      role="img"
      aria-label={`${team1Meta.shortName} ${(team1Prob * 100).toFixed(0)} percent, ${team2Meta.shortName} ${(team2Prob * 100).toFixed(0)} percent`}
    >
      <div className="h-full w-full rounded-full bg-[#10161d]" />

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-black text-white">
          {isTossUp ? '50/50' : `${(winnerProb * 100).toFixed(0)}%`}
        </p>
        <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">
          {isTossUp ? 'Toss-up' : `${getTeamMeta(winner).shortName} wins`}
        </p>
      </div>

      {/* Legend */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team1Meta.primaryColor }} />
          <span className="text-gray-400">{team1Meta.shortName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team2Meta.primaryColor }} />
          <span className="text-gray-400">{team2Meta.shortName}</span>
        </div>
      </div>
    </div>
  );
}
