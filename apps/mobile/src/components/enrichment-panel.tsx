import type { MatchEnrichment } from '@sixsense/domain';
import { StyleSheet, Text, View } from 'react-native';

import { DetailSection, detailStyles } from '@/components/detail-section';
import { theme } from '@/theme';

export function EnrichmentPanel({ enrichment }: { enrichment: MatchEnrichment | null }) {
  if (!enrichment) return null;

  return (
    <DetailSection title="Match intelligence" eyebrow={`${enrichment.confidence.toUpperCase()} CONFIDENCE`}>
      {enrichment.expert_preview ? <Text style={detailStyles.body}>{enrichment.expert_preview}</Text> : null}
      {enrichment.player_updates.length > 0 ? (
        <View style={styles.updates}>
          <Text style={styles.label}>PLAYER UPDATES</Text>
          {enrichment.player_updates.slice(0, 5).map((update, index) => (
            <View key={`${update.player ?? update.team ?? 'update'}-${index}`} style={styles.update}>
              <Text style={styles.updateTitle}>{update.player || update.team || 'Team update'}</Text>
              <Text style={detailStyles.muted}>{update.status}</Text>
              {update.confidence ? <Text style={styles.confidence}>{update.confidence}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.sources}>
        {enrichment.source_links.length} source{enrichment.source_links.length === 1 ? '' : 's'} · generated{' '}
        {new Date(enrichment.generated_at).toLocaleString()}
      </Text>
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  updates: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  label: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  update: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  updateTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  confidence: {
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: '800',
    marginTop: theme.spacing.xs,
    textTransform: 'uppercase',
  },
  sources: {
    color: theme.colors.muted,
    fontSize: 10,
    marginTop: theme.spacing.lg,
  },
});
