import type { EdgeScore, Match } from '@sixsense/domain';
import { StyleSheet, Text, View } from 'react-native';

import { DetailSection, detailStyles } from '@/components/detail-section';
import { theme } from '@/theme';

export function EdgeScoreCard({ edgeScore, match }: { edgeScore: EdgeScore | null; match: Match }) {
  if (!edgeScore) return null;

  return (
    <DetailSection title="Edge score" eyebrow="DETERMINISTIC SIGNAL">
      <View style={styles.scoreRow}>
        <View style={styles.teamScore}>
          <Text style={styles.team}>{match.team1}</Text>
          <Text style={styles.score}>{edgeScore.team1_score.toFixed(0)}</Text>
        </View>
        <View style={styles.net}>
          <Text style={styles.netLabel}>NET EDGE</Text>
          <Text style={styles.netValue}>{Math.abs(edgeScore.net_edge).toFixed(1)}</Text>
        </View>
        <View style={[styles.teamScore, styles.teamScoreRight]}>
          <Text style={styles.team}>{match.team2}</Text>
          <Text style={styles.score}>{edgeScore.team2_score.toFixed(0)}</Text>
        </View>
      </View>
      <Text style={styles.edgeTeam}>Edge: {edgeScore.edge_team}</Text>
      {edgeScore.narrative ? <Text style={[detailStyles.body, styles.narrative]}>{edgeScore.narrative}</Text> : null}
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  scoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  teamScore: {
    flex: 1,
  },
  teamScoreRight: {
    alignItems: 'flex-end',
  },
  team: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  score: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  net: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  netLabel: {
    color: theme.colors.accent,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  netValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  edgeTeam: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  narrative: {
    marginTop: theme.spacing.md,
  },
});
