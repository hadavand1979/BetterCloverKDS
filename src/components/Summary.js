import { ScrollView, StyleSheet, Text, View } from 'react-native';

const { colors } = require('../theme');
const { formatCount, tallySentence } = require('../tally');

export function Summary({ tally, layout, heading }) {
  const sentence = tallySentence(tally);
  const title = heading || 'Summary';
  if (layout === 'column') {
    return (
      <View style={styles.column} accessibilityLabel={`Summary for ${title}: ${sentence || 'no items'}`}>
        <Text style={styles.heading}>{title}</Text>
        {tally.length === 0 ? <Text style={styles.empty}>No items on the board</Text> : null}
        <ScrollView style={styles.columnScroll}>
          {tally.map((row) => (
            <View key={row.name} style={styles.row}>
              <Text style={styles.count}>{formatCount(row.count)}</Text>
              <Text style={styles.name}>{row.name}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      style={styles.chipsBar}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityLabel={`Summary for ${title}: ${sentence || 'no items'}`}
    >
      <Text style={styles.chipLabel}>{title}</Text>
      {tally.length === 0 ? <Text style={styles.chipEmpty}>Nothing firing</Text> : null}
      {tally.map((row) => (
        <View key={row.name} style={styles.chip}>
          <Text style={styles.chipCount}>{formatCount(row.count)}</Text>
          <Text style={styles.chipName}>{row.name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  column: {
    width: 250,
    alignSelf: 'stretch',
    backgroundColor: '#171b22',
    borderRadius: 18,
    padding: 16,
    marginRight: 14,
  },
  columnScroll: { flex: 1 },
  heading: {
    color: '#9aa6b8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  empty: { color: colors.muted, fontSize: 16 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'center' },
  count: {
    width: 42,
    color: colors.gold,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  name: { color: colors.white, fontSize: 16, fontWeight: '700', flex: 1 },
  chipsBar: {
    flexGrow: 0,
    flexShrink: 0,
    height: 52,
    maxHeight: 52,
  },
  chips: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  chipLabel: { color: '#c5ceda', fontSize: 14, fontWeight: '800', marginRight: 4 },
  chipEmpty: { color: colors.muted, fontSize: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.chip,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipCount: { color: colors.gold, fontWeight: '800', fontSize: 16, fontVariant: ['tabular-nums'] },
  chipName: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
