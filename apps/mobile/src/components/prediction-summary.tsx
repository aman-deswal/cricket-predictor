import { formatWinProbability, type Match, type Prediction } from '@sixsense/domain';
import { StyleSheet, Text, View } from 'react-native';

import { DetailSection, detailStyles } from '@/components/detail-section';
import { theme } from '@/theme';

function ProbabilityRow({ team, probability, selected }: { team: string; probability: number; selected: boolean }) {
  const width = `${Math.max(0, Math.min(100, probability * 100))}%` as const;

  return (
    <View style={styles.probabilityRow}>
      <View style={styles.probabilityLabels}>
        <Text style={[styles.team, selected && styles.selectedTeam]}>{team}</Text>
        <Text style={[styles.value, selected && styles.selectedValue]}>{formatWinProbability(probability)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, selected && styles.selectedFill, { width }]} />
      </View>
    </View>
  );
}

export function PredictionSummary({ match, prediction }: { match: Match; prediction: Prediction | null }) {
  if (!prediction) {
    return (
      <DetailSection title="Prediction">
        <Text style={detailStyles.muted}>The deterministic prediction has not been published yet.</Text>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="SixSense prediction" eyebrow={`${prediction.confidence.toUpperCase()} CONFIDENCE`}>
      <Text style={styles.pickLabel}>PREDICTED WINNER</Text>
      <Text style={styles.pick}>{prediction.predicted_winner}</Text>

      <View style={styles.probabilities}>
        <ProbabilityRow
          team={match.team1}
          probability={prediction.team1_win_probability}
          selected={prediction.predicted_winner === match.team1}
        />
        <ProbabilityRow
          team={match.team2}
          probability={prediction.team2_win_probability}
          selected={prediction.predicted_winner === match.team2}
        />
      </View>

      {prediction.reasoning ? (
        <View style={styles.copyBlock}>
          <Text style={styles.copyLabel}>MODEL READ</Text>
          <Text style={detailStyles.body}>{prediction.reasoning}</Text>
        </View>
      ) : null}
      {prediction.toss_insight ? (
        <View style={styles.copyBlock}>
          <Text style={styles.copyLabel}>TOSS IMPACT</Text>
          <Text style={detailStyles.body}>{prediction.toss_insight}</Text>
        </View>
      ) : null}
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  pickLabel: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  pick: {
    color: theme.colors.accent,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  probabilities: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  probabilityRow: {
    gap: theme.spacing.xs,
  },
  probabilityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  team: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  selectedTeam: {
    color: theme.colors.text,
  },
  value: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  selectedValue: {
    color: theme.colors.accent,
  },
  track: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: theme.colors.muted,
    borderRadius: 999,
    height: '100%',
  },
  selectedFill: {
    backgroundColor: theme.colors.accent,
  },
  copyBlock: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  copyLabel: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: theme.spacing.xs,
  },
});
