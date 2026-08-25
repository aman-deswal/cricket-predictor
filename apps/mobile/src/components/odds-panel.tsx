import type { Match, MatchOdds } from '@sixsense/domain';
import { StyleSheet, Text, View } from 'react-native';

import { DetailSection, detailStyles } from '@/components/detail-section';
import { theme } from '@/theme';

function latestBookmakerOdds(odds: MatchOdds[]): MatchOdds[] {
  const latest = new Map<string, MatchOdds>();
  for (const snapshot of odds) {
    const key = snapshot.bookmaker.toLowerCase();
    if (!latest.has(key) && snapshot.team1_odds > 1 && snapshot.team2_odds > 1) {
      latest.set(key, snapshot);
    }
  }
  return [...latest.values()].slice(0, 5);
}

export function OddsPanel({ match, odds }: { match: Match; odds: MatchOdds[] }) {
  const currentOdds = latestBookmakerOdds(odds);
  if (currentOdds.length === 0) return null;

  return (
    <DetailSection title="Sportsbook market" eyebrow="LATEST AVAILABLE ODDS">
      <View style={styles.teamLabels}>
        <Text style={detailStyles.muted}>Book</Text>
        <Text numberOfLines={1} style={styles.teamLabel}>{match.team1}</Text>
        <Text numberOfLines={1} style={styles.teamLabel}>{match.team2}</Text>
      </View>
      {currentOdds.map((snapshot) => (
        <View key={snapshot.bookmaker} style={styles.row}>
          <Text numberOfLines={1} style={styles.bookmaker}>{snapshot.bookmaker}</Text>
          <Text style={styles.price}>{snapshot.team1_odds.toFixed(2)}</Text>
          <Text style={styles.price}>{snapshot.team2_odds.toFixed(2)}</Text>
        </View>
      ))}
      <Text style={styles.disclaimer}>Market prices are context only and may change after the displayed refresh.</Text>
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  teamLabels: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  teamLabel: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right',
  },
  row: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  bookmaker: {
    color: theme.colors.text,
    flex: 1.2,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  price: {
    color: theme.colors.accent,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  disclaimer: {
    color: theme.colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: theme.spacing.xs,
  },
});
