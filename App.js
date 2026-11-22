import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClosedList } from './src/components/ClosedList';
import { Summary } from './src/components/Summary';
import { Settings } from './src/components/Settings';
import { Ticket } from './src/components/Ticket';
import { loadSettings, saveSettings } from './src/storage';
import { useKitchen } from './src/useKitchen';

const { boardTickets, settingsForBoard, tallyLines } = require('./src/tally');
const { colors } = require('./src/theme');

export default function App() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Better Clover KDS';
    }
    loadSettings().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootTitle}>Better Clover KDS</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Kitchen settings={settings} setSettings={setSettings} />
    </SafeAreaProvider>
  );
}

function Kitchen({ settings, setSettings }) {
  useEffect(() => {
    activateKeepAwakeAsync('better-clover-kds').catch(() => {});
    return () => {
      try {
        const release = deactivateKeepAwake('better-clover-kds');
        if (release && typeof release.catch === 'function') release.catch(() => {});
      } catch (error) {
        // The browser can release the wake lock before activation finishes.
      }
    };
  }, []);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const kitchen = useKitchen(settings);
  const [now, setNow] = useState(Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [pickedIds, setPickedIds] = useState(null);
  const [selectedClosedId, setSelectedClosedId] = useState(null);
  const [undo, setUndo] = useState(null);
  const [notice, setNotice] = useState('');
  const [boardHeight, setBoardHeight] = useState(0);
  const wide = width >= 980;
  const tablet = width >= 700;
  const large = tablet;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!undo) return undefined;
    const id = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(id);
  }, [undo]);

  const { active, closed } = useMemo(
    () => boardTickets(kitchen.orders, kitchen.bumps, settingsForBoard(settings)),
    [kitchen.orders, kitchen.bumps, settings],
  );
  const focusTicket = active.find((ticket) => !ticket.held) || active[0] || null;
  const summarizedTickets = useMemo(() => {
    if (!pickedIds) return focusTicket ? [focusTicket] : [];
    const chosen = active.filter((ticket) => pickedIds.includes(ticket.id));
    return chosen.length ? chosen : (focusTicket ? [focusTicket] : []);
  }, [active, pickedIds, focusTicket]);
  const summary = useMemo(
    () => tallyLines(summarizedTickets.flatMap((ticket) => ticket.lines), { includeModifiers: settings.includeModifiers }),
    [summarizedTickets, settings.includeModifiers],
  );
  const summaryHeading = summarizedTickets.length > 1
    ? `${summarizedTickets.length} tickets`
    : (summarizedTickets[0]?.title || 'Summary');
  const summarizedIds = new Set(summarizedTickets.map((ticket) => ticket.id));
  const clock = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tickets = active;
  const selectedClosed = closed.find((ticket) => ticket.id === selectedClosedId) || null;

  useEffect(() => {
    if (!pickedIds) return;
    const live = pickedIds.filter((id) => active.some((ticket) => ticket.id === id));
    if (live.length === pickedIds.length) return;
    setPickedIds(live.length ? live : null);
  }, [active, pickedIds]);

  function toggleSummary(ticket) {
    setPickedIds((current) => {
      const onBoard = new Set(active.map((item) => item.id));
      const base = (current || (focusTicket ? [focusTicket.id] : [])).filter((id) => onBoard.has(id));
      const start = base.length ? base : (focusTicket ? [focusTicket.id] : []);
      if (start.includes(ticket.id)) {
        const next = start.filter((id) => id !== ticket.id);
        return next.length ? next : start;
      }
      return [...start, ticket.id];
    });
  }

  async function bump(ticket) {
    try {
      await kitchen.bump(ticket);
      setNotice('');
      setUndo({ id: ticket.id, title: ticket.title });
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function makeActive(ticket) {
    try {
      await kitchen.recall(ticket.id);
      setNotice('');
      setSelectedClosedId(null);
      setShowClosed(false);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function toggleLine(ticket, line) {
    try {
      await kitchen.toggleLine(ticket, line);
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function holdTicket(ticket, held) {
    try {
      await kitchen.hold(ticket, held);
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function restore() {
    if (!undo) return;
    const id = undo.id;
    setUndo(null);
    try {
      await kitchen.recall(id);
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.wordmark}>Better Clover KDS</Text>
          <Text style={styles.status} numberOfLines={1}>
            {kitchen.merchantName || 'Connecting'}{settings.mode === 'demo' ? ' · Sample tickets' : ''}
          </Text>
        </View>
        <Text style={styles.clock}>{clock}</Text>
        <Pressable
          style={styles.headerButton}
          onPress={() => {
            setShowClosed((value) => !value);
            setSelectedClosedId(null);
          }}
          accessibilityRole="button"
          testID="closed-toggle"
        >
          <Text style={styles.headerButtonText}>{showClosed ? 'Open' : `Closed${closed.length ? ` ${closed.length}` : ''}`}</Text>
        </Pressable>
        <Pressable style={styles.headerButton} onPress={() => setShowSettings(true)} accessibilityRole="button">
          <Text style={styles.headerButtonText}>Settings</Text>
        </Pressable>
      </View>

      {notice || kitchen.error ? <Text style={styles.error}>{notice || kitchen.error}</Text> : null}
      {!wide && !showClosed && tickets.length > 0 ? <Summary tally={summary} layout="chips" heading={summaryHeading} /> : null}

      <View style={styles.board} onLayout={(event) => setBoardHeight(event.nativeEvent.layout.height)}>
        {showClosed ? (
          <ClosedBoard
            tickets={closed}
            selected={selectedClosed}
            loading={kitchen.loading}
            tablet={tablet}
            large={large}
            now={now}
            boardHeight={boardHeight}
            warningMinutes={settings.warningMinutes}
            lateMinutes={settings.lateMinutes}
            onSelect={setSelectedClosedId}
            onActivate={makeActive}
          />
        ) : null}
        {!showClosed && kitchen.loading && tickets.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : null}
        {!showClosed && !kitchen.loading && tickets.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No open tickets</Text>
            <Text style={styles.emptyBody}>
              {settings.mode === 'demo'
                ? 'Sample tickets show up here. If they were bumped, open Settings and tap Reset sample tickets.'
                : 'Open Clover orders show up here. Closed orders stay under Closed, where you can open one and make it active again.'}
            </Text>
          </View>
        ) : null}
        {!showClosed && tickets.length > 0 && tablet ? (
          <View style={styles.wideRow}>
            {wide ? <Summary tally={summary} layout="column" heading={summaryHeading} /> : null}
            <ScrollView
              horizontal
              style={styles.rail}
              contentContainerStyle={styles.railContent}
              showsHorizontalScrollIndicator
            >
              {tickets.map((ticket) => (
                <Ticket
                  key={ticket.id}
                  ticket={ticket}
                  now={now}
                  warningMinutes={settings.warningMinutes}
                  lateMinutes={settings.lateMinutes}
                  large={large}
                  pinned
                  height={Math.max(boardHeight - 16, 320)}
                  onBump={bump}
                  onHold={holdTicket}
                  onToggleLine={toggleLine}
                  summarized={summarizedIds.has(ticket.id)}
                  onToggleSummary={toggleSummary}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {!showClosed && tickets.length > 0 && !tablet ? (
          <ScrollView contentContainerStyle={styles.phoneList}>
            {tickets.map((ticket) => (
              <View key={ticket.id} style={styles.phoneTicket}>
                <Ticket
                  key={ticket.id}
                  ticket={ticket}
                  now={now}
                  warningMinutes={settings.warningMinutes}
                  lateMinutes={settings.lateMinutes}
                  large={false}
                  pinned={false}
                  fill
                  onBump={bump}
                  onHold={holdTicket}
                  onToggleLine={toggleLine}
                  summarized={summarizedIds.has(ticket.id)}
                  onToggleSummary={toggleSummary}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {undo ? (
        <View style={styles.undo}>
          <Text style={styles.undoText}>{undo.title} bumped</Text>
          <Pressable onPress={restore} accessibilityRole="button">
            <Text style={styles.undoAction}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      <Settings
        visible={showSettings}
        settings={settings}
        onClose={() => setShowSettings(false)}
        onSave={async (next) => {
          setSettings(next);
          await saveSettings(next);
          setShowSettings(false);
        }}
        labels={kitchen.labels}
        onResetDemo={() => {
          kitchen.resetDemo();
          setShowSettings(false);
        }}
      />
    </View>
  );
}

function ClosedBoard({
  tickets,
  selected,
  loading,
  tablet,
  large,
  now,
  boardHeight,
  warningMinutes,
  lateMinutes,
  onSelect,
  onActivate,
}) {
  if (loading && tickets.length === 0) {
    return <ActivityIndicator color={colors.gold} style={styles.loader} />;
  }
  if (tickets.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No closed tickets</Text>
        <Text style={styles.emptyBody}>
          Orders closed at the register, and tickets bumped on this screen, show up here.
        </Text>
      </View>
    );
  }

  const detail = selected ? (
    <Ticket
      ticket={selected}
      now={now}
      warningMinutes={warningMinutes}
      lateMinutes={lateMinutes}
      large={large}
      pinned={tablet}
      fill={!tablet}
      height={tablet ? Math.max(boardHeight - 16, 320) : undefined}
      archive
      onActivate={onActivate}
    />
  ) : (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Choose a ticket</Text>
      <Text style={styles.emptyBody}>
        Tap a closed ticket to see the items. Make it active if it was finished by accident.
      </Text>
    </View>
  );

  if (!tablet) {
    if (!selected) {
      return (
        <View style={styles.closedPhone}>
          <ClosedList tickets={tickets} selectedId={null} onSelect={onSelect} fill />
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.phoneList}>
        <Pressable onPress={() => onSelect(null)} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.headerButtonText}>All closed</Text>
        </Pressable>
        {detail}
      </ScrollView>
    );
  }

  return (
    <View style={styles.wideRow}>
      <ClosedList tickets={tickets} selectedId={selected ? selected.id : null} onSelect={onSelect} />
      <View style={styles.closedDetail}>{detail}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.board,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootTitle: { color: colors.white, fontSize: 28, fontWeight: '800' },
  screen: { flex: 1, backgroundColor: colors.board },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerCopy: { flexGrow: 1, flexShrink: 1, minWidth: 180 },
  wordmark: { color: colors.white, fontSize: 22, fontWeight: '800' },
  status: { color: '#b7c0cc', fontSize: 14, marginTop: 2 },
  clock: { color: colors.white, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  headerButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#2a3140',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: { color: colors.white, fontWeight: '700' },
  error: { color: '#ffb4ab', paddingHorizontal: 16, paddingBottom: 8, fontSize: 15 },
  board: { flex: 1 },
  wideRow: { flex: 1, flexDirection: 'row', paddingLeft: 16 },
  rail: { flex: 1 },
  railContent: { paddingHorizontal: 16, paddingBottom: 12, alignItems: 'stretch' },
  phoneList: { paddingHorizontal: 16, paddingBottom: 24 },
  phoneTicket: { marginBottom: 16, alignItems: 'stretch' },
  closedPhone: { flex: 1, paddingHorizontal: 16 },
  closedDetail: { flex: 1, minWidth: 360, paddingRight: 16 },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#2a3140',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  loader: { marginTop: 48 },
  empty: { padding: 32 },
  emptyTitle: { color: colors.white, fontSize: 28, fontWeight: '800' },
  emptyBody: { color: '#b7c0cc', fontSize: 16, marginTop: 8, maxWidth: 460, lineHeight: 22 },
  undo: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#2a3140',
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  undoText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  undoAction: { color: colors.gold, fontSize: 16, fontWeight: '800' },
});
