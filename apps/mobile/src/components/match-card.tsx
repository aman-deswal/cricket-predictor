import { getPrimaryPrediction, formatWinProbability, type MatchWithPredictions } from '@sixsense/domain';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export function MatchCard({ match }: { match: MatchWithPredictions }) {
  const prediction = getPrimaryPrediction(match);
  const kickoff = new Date(match.date);
  const kickoffLabel = Number.isNaN(kickoff.getTime())
    ? 'Time TBD'
    : kickoff.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${match.team1} versus ${match.team2}`}
      onPress={() => router.push({ pathname: '/match/[matchId]', params: { matchId: match.match_id } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.metaRow}>
        <Text style={styles.competition}>{match.competition_name || match.match_type}</Text>
        <Text style={[styles.status, match.status === 'live' && styles.live]}>{match.status.toUpperCase()}</Text>
      </View>
      <Text style={styles.teams}>{match.team1}</Text>
      <Text style={styles.versus}>vs</Text>
      <Text style={styles.teams}>{match.team2}</Text>
      <Text style={styles.kickoff}>{kickoffLabel} · {match.venue || 'Venue TBD'}</Text>

      {prediction ? (
        <View style={styles.pick}>
          <View>
            <Text style={styles.pickLabel}>SIXSENSE PICK</Text>
            <Text style={styles.pickTeam}>{prediction.predicted_winner}</Text>
          </View>
          <View style={styles.probabilities}>
            <Text style={styles.probability}>{formatWinProbability(prediction.team1_win_probability)}</Text>
            <Text style={styles.probabilityDivider}>/</Text>
            <Text style={styles.probability}>{formatWinProbability(prediction.team2_win_probability)}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.pending}>Prediction pending</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  pressed: {
    opacity: 0.78,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  competition: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  status: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
  },
  live: {
    color: theme.colors.positive,
  },
  teams: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  versus: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginVertical: 2,
    textTransform: 'uppercase',
  },
  kickoff: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: theme.spacing.md,
  },
  pick: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
  },
  pickLabel: {
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  pickTeam: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  probabilities: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  probability: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  probabilityDivider: {
    color: theme.colors.muted,
    marginHorizontal: 4,
  },
  pending: {
    color: theme.colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: theme.spacing.lg,
  },
});
