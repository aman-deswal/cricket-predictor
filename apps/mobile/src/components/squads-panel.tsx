import type { MatchSquad } from '@sixsense/domain';
import { StyleSheet, Text, View } from 'react-native';

import { DetailSection, detailStyles } from '@/components/detail-section';
import { theme } from '@/theme';

export function SquadsPanel({ squads }: { squads: MatchSquad[] }) {
  if (squads.length === 0) return null;

  return (
    <DetailSection title="Squads" eyebrow="LATEST TEAM DATA">
      <View style={styles.squads}>
        {squads.map((squad) => (
          <View key={squad.team} style={styles.squad}>
            <View style={styles.header}>
              <Text style={styles.team}>{squad.team}</Text>
              <Text style={[styles.status, squad.is_confirmed && styles.confirmed]}>
                {squad.is_confirmed ? 'CONFIRMED' : 'PROVISIONAL'}
              </Text>
            </View>
            {squad.players.slice(0, 11).map((player, index) => (
              <View key={player.id || `${player.name}-${index}`} style={styles.player}>
                <Text style={styles.number}>{index + 1}</Text>
                <Text style={detailStyles.body}>
                  {player.name}
                  {player.is_captain ? ' (c)' : ''}
                  {player.is_keeper ? ' (wk)' : ''}
                </Text>
                <Text style={styles.role}>{player.role}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  squads: {
    gap: theme.spacing.lg,
  },
  squad: {
    gap: theme.spacing.sm,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  team: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  status: {
    color: theme.colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  confirmed: {
    color: theme.colors.positive,
  },
  player: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  number: {
    color: theme.colors.muted,
    fontSize: 10,
    width: 16,
  },
  role: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 10,
    textAlign: 'right',
  },
});
