import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const { colors, typeColors } = require('../theme');
const { formatCount, tallySentence, isInstructionModifier } = require('../tally');

function formatReceived(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatAge(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function headerColor(ticket, ageMs, warningMinutes, lateMinutes, archive) {
  if (ticket.held) return typeColors.held;
  if (archive) return typeColors[ticket.serviceTone] || typeColors.here;
  if (ageMs >= lateMinutes * 60000) return typeColors.late;
  if (ageMs >= warningMinutes * 60000) return typeColors.warn;
  return typeColors[ticket.serviceTone] || typeColors.here;
}

function lineModifiers(line) {
  return (line.modifiers || []).map((mod) => {
    const name = canonicalMod(mod);
    return { name, instruction: isInstructionModifier(name) };
  }).filter((mod) => mod.name);
}

function canonicalMod(mod) {
  return String(typeof mod === 'string' ? mod : mod.name || '').replace(/\s+/g, ' ').trim();
}

export function Ticket({ ticket, now, warningMinutes, lateMinutes, large, pinned, height, fill, onBump, onHold, onToggleLine, archive, onActivate, summarized, onToggleSummary }) {
  const end = archive && ticket.closedAt ? ticket.closedAt : now;
  const ageMs = Math.max(0, end - ticket.createdTime);
  const background = headerColor(ticket, ageMs, warningMinutes, lateMinutes, archive);
  const tallyLabel = tallySentence(ticket.tally);
  const itemLabel = ticket.itemCount === 1 ? '1 item' : `${formatCount(ticket.itemCount)} items`;
  const received = formatReceived(ticket.createdTime);
  const meta = [ticket.serverName, itemLabel].filter(Boolean).join(' · ');
  const Body = pinned ? ScrollView : View;

  return (
    <View
      style={[styles.ticket, fill && styles.ticketFill, large && !fill && styles.ticketLarge, pinned && { height }, summarized && styles.ticketSelected]}
      accessibilityLabel={`${ticket.title}. ${ticket.orderType || 'Order'}. Received ${received}. ${formatAge(ageMs)} on the board. ${itemLabel}.`}
    >
      <View style={[styles.header, { backgroundColor: background }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.type, large && styles.typeLarge]}>{(ticket.orderType || 'Order').toUpperCase()}</Text>
          <View style={styles.times}>
            <Text style={[styles.timer, large && styles.timerLarge]}>{formatAge(ageMs)}</Text>
            <Text style={styles.received}>{received}</Text>
          </View>
        </View>
        <Text style={[styles.title, large && styles.titleLarge]} numberOfLines={2}>{ticket.title}</Text>
        <View style={styles.headerBottom}>
          {onToggleSummary ? (
            <Pressable
              onPress={() => onToggleSummary(ticket)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: Boolean(summarized) }}
              accessibilityLabel={`Summarize ${ticket.title}`}
              testID={`summarize-${ticket.id}`}
              style={styles.summarizeHit}
            >
              <View style={[styles.check, summarized && styles.checkOn]}>
                {summarized ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
            </Pressable>
          ) : null}
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
          {ticket.held ? <Text style={styles.badge}>HELD</Text> : null}
          {archive && ticket.state === 'locked' ? <Text style={styles.badge}>CLOSED</Text> : null}
          {archive && (ticket.bumped || ticket.kitchenDone) && ticket.state !== 'locked' ? <Text style={styles.badge}>COMPLETED</Text> : null}
          {ticket.paymentState === 'PAID' ? <Text style={styles.badge}>PAID</Text> : null}
        </View>
      </View>

      <Body style={styles.body} contentContainerStyle={pinned ? styles.bodyContent : undefined} nestedScrollEnabled>
        {ticket.note ? <Text style={styles.note}>{ticket.note}</Text> : null}
        {(ticket.lines || []).map((line, index) => {
          const mods = lineModifiers(line);
          const done = Boolean(line.done);
          return (
            <Pressable
              key={line.id || `${line.name}-${index}`}
              style={styles.group}
              disabled={!onToggleLine}
              onPress={() => onToggleLine && onToggleLine(ticket, line)}
              accessibilityRole={onToggleLine ? 'checkbox' : undefined}
              accessibilityState={onToggleLine ? { checked: done } : undefined}
              accessibilityLabel={done ? `Mark ${line.name} not done` : `Mark ${line.name} done`}
              testID={line.id ? `line-${line.id}` : undefined}
            >
              <View style={styles.groupRow}>
                <Text style={[styles.qty, large && styles.qtyLarge, done && styles.doneText]}>{formatCount(line.qty || 1)}</Text>
                <View style={styles.groupCopy}>
                  <Text style={[styles.item, large && styles.itemLarge, done && styles.doneText]}>{line.name}</Text>
                  {line.unit ? <Text style={[styles.unit, done && styles.doneText]}>{line.unit}</Text> : null}
                  {line.note ? <Text style={[styles.itemNote, done && styles.doneText]}>{line.note}</Text> : null}
                </View>
                {done ? <Text style={styles.doneMark}>✓</Text> : null}
              </View>
              {mods.map((mod) => (
                <Text
                  key={mod.name}
                  style={[styles.mod, mod.instruction && styles.modInstruction, large && styles.modLarge, done && styles.doneText]}
                >
                  {mod.name}
                </Text>
              ))}
            </Pressable>
          );
        })}
      </Body>

      <View
        style={styles.tally}
        testID={`tally-${ticket.id}`}
        accessible
        accessibilityLabel={`On this ticket: ${tallyLabel}`}
      >
        <Text style={styles.tallyHeading}>ON THIS TICKET</Text>
        {ticket.tally.map((row) => (
          <View key={row.name} style={styles.tallyRow}>
            <Text style={[styles.tallyCount, large && styles.tallyCountLarge]}>{formatCount(row.count)}</Text>
            <Text style={[styles.tallyName, large && styles.tallyNameLarge]}>{row.name}</Text>
          </View>
        ))}
      </View>

      {archive ? (
        <Pressable
          style={styles.bump}
          testID={`activate-${ticket.id}`}
          onPress={() => onActivate(ticket)}
          accessibilityRole="button"
          accessibilityLabel={`Make ${ticket.title} active`}
        >
          <Text style={styles.bumpText}>Make active</Text>
        </Pressable>
      ) : (
        <View style={styles.actions}>
          <Pressable style={styles.hold} onPress={() => onHold(ticket, !ticket.held)} accessibilityRole="button">
            <Text style={styles.holdText}>{ticket.held ? 'Resume' : 'Hold'}</Text>
          </Pressable>
          <Pressable
            style={styles.bump}
            testID={`bump-${ticket.id}`}
            onPress={() => onBump(ticket)}
            accessibilityRole="button"
            accessibilityLabel={`Bump ${ticket.title}`}
          >
            <Text style={styles.bumpText}>Bump</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    width: 340,
    backgroundColor: colors.paper,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 14,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  ticketSelected: { borderColor: colors.gold },
  summarizeHit: { paddingRight: 4 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#f3f6fb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkMark: { color: colors.ink, fontSize: 16, fontWeight: '800', lineHeight: 18 },
  ticketLarge: {
    width: 380,
  },
  ticketFill: {
    width: '100%',
    marginRight: 0,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  type: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  typeLarge: { fontSize: 16 },
  timer: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timerLarge: { fontSize: 34 },
  times: { alignItems: 'flex-end' },
  received: { color: '#f3f6fb', fontSize: 15, fontWeight: '700', marginTop: 2 },
  title: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  titleLarge: { fontSize: 30 },
  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  meta: {
    color: '#f3f6fb',
    fontSize: 15,
    flex: 1,
  },
  badge: {
    color: colors.ink,
    backgroundColor: '#f4d35e',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '800',
  },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 8 },
  note: {
    marginHorizontal: 16,
    marginTop: 12,
    color: colors.ink,
    fontStyle: 'italic',
    fontSize: 16,
  },
  group: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  groupRow: { flexDirection: 'row', gap: 10 },
  qty: {
    width: 36,
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  qtyLarge: { fontSize: 28, width: 42 },
  groupCopy: { flex: 1 },
  item: { fontSize: 22, fontWeight: '800', color: colors.ink },
  itemLarge: { fontSize: 26 },
  unit: { color: colors.muted, fontSize: 15, marginTop: 2 },
  itemNote: { color: colors.muted, fontStyle: 'italic', fontSize: 15, marginTop: 2 },
  doneText: { color: '#8d867b', textDecorationLine: 'line-through' },
  doneMark: { color: colors.green, fontSize: 22, fontWeight: '800', marginLeft: 8 },
  mod: {
    marginLeft: 46,
    marginTop: 2,
    color: '#3d4450',
    fontSize: 17,
  },
  modLarge: { fontSize: 20, marginLeft: 52 },
  modInstruction: { color: colors.red, fontWeight: '700' },
  tally: {
    backgroundColor: colors.tally,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 230,
  },
  tallyHeading: {
    color: '#9aa6b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  tallyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 3,
  },
  tallyCount: {
    width: 42,
    color: colors.gold,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  tallyCountLarge: { fontSize: 26, width: 48 },
  tallyName: { color: colors.white, fontSize: 18, fontWeight: '700', flex: 1 },
  tallyNameLarge: { fontSize: 22 },
  actions: { backgroundColor: colors.paper },
  hold: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  holdText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  bump: {
    minHeight: 58,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bumpText: { color: colors.white, fontSize: 20, fontWeight: '800', letterSpacing: 0.4 },
});
