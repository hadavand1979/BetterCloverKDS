import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const { colors } = require('../theme');
const { formatCount } = require('../tally');

function closedLabel(ticket) {
  if (ticket.state === 'locked') return 'Closed';
  if (ticket.bumped || ticket.kitchenDone) return 'Completed';
  return 'Closed';
}

export function ClosedList({ tickets, selectedId, onSelect, fill }) {
  return (
    <ScrollView style={[styles.list, fill && styles.listFill]} contentContainerStyle={styles.content}>
      {tickets.map((ticket) => {
        const selected = ticket.id === selectedId;
        const when = new Date(ticket.createdTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const label = closedLabel(ticket);
        const count = ticket.itemCount === 1 ? '1 item' : `${formatCount(ticket.itemCount)} items`;
        return (
          <Pressable
            key={ticket.id}
            onPress={() => onSelect(ticket.id)}
            style={[styles.row, selected && styles.rowSelected]}
            accessibilityRole="button"
            accessibilityLabel={`${ticket.title}, ${label}`}
            testID={`closed-${ticket.id}`}
          >
            <View style={styles.rowTop}>
              <Text style={styles.title} numberOfLines={1}>{ticket.title}</Text>
              <Text style={styles.time}>{when}</Text>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {`${ticket.orderType || 'Order'} · ${label} · ${count}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { width: 300, maxWidth: 300, flexGrow: 0, flexShrink: 0, alignSelf: 'stretch' },
  listFill: { width: '100%', maxWidth: '100%', flexGrow: 1, flexShrink: 1 },
  content: { paddingRight: 12, paddingBottom: 16 },
  row: {
    backgroundColor: '#1b212c',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowSelected: { borderColor: colors.gold },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.white, fontSize: 18, fontWeight: '800', flex: 1 },
  time: { color: '#d5dbe3', fontSize: 14, fontWeight: '700' },
  meta: { color: '#b7c0cc', fontSize: 14, marginTop: 4 },
});
