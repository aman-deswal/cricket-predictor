import { formatWinProbability, type PredictionHistoryItem } from '@sixsense/domain';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export function HistoryCard({ item }: { item: PredictionHistoryItem }) {
  const scoreLabel = item.brier_score === null ? 'Not scored' : `Brier ${item.brier_score.toFixed(3)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.team1} versus ${item.team2}`}
      onPress={() => router.push({ pathname: '/match/[matchId]', params: { matchId: item.match_id } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={[styles.outcome, item.correct ? styles.correct : styles.incorrect]}>
          <Text style={[styles.outcomeText, item.correct ? styles.correctText : styles.incorrectText]}>
            {item.correct ? 'CORRECT' : 'MISSED'}
          </Text>
        </View>
        <Text style={styles.date}>
          {new Date(item.scored_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
      </View>

      <Text style={styles.matchup}>{item.team1}</Text>
      <Text style={styles.versus}>vs</Text>
      <Text style={styles.matchup}>{item.team2}</Text>

      <View style={styles.verdict}>
        <View style={styles.verdictColumn}>
          <Text style={styles.label}>SIXSENSE PICK</Text>
          <Text style={styles.pick}>{item.predicted_winner}</Text>
          <Text style={styles.probability}>{formatWinProbability(item.predicted_probability)}</Text>
        </View>
        <View style={[styles.verdictColumn, styles.actualColumn]}>
          <Text style={styles.label}>ACTUAL WINNER</Text>
          <Text style={styles.actual}>{item.actual_winner}</Text>
          <Text style={styles.score}>{scoreLabel}</Text>
        </View>
      </View>

      {item.result_text ? <Text style={styles.result}>{item.result_text}</Text> : null}
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  outcome: {
    borderRadius: 999,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  correct: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  incorrect: {
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
  },
  outcomeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  correctText: {
    color: theme.colors.positive,
  },
  incorrectText: {
    color: theme.colors.negative,
  },
  date: {
    color: theme.colors.muted,
    fontSize: 10,
  },
  matchup: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  versus: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '800',
    marginVertical: 2,
  },
  verdict: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  verdictColumn: {
    flex: 1,
  },
  actualColumn: {
    alignItems: 'flex-end',
  },
  label: {
    color: theme.colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  pick: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  probability: {
    color: theme.colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  actual: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
    textAlign: 'right',
  },
  score: {
    color: theme.colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  result: {
    color: theme.colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: theme.spacing.md,
  },
});
