import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

const { ENVIRONMENTS, testClover, describeNetworkError } = require('../clover');
const { testServer, loginServer } = require('../serverClient');
const { colors } = require('../theme');

const MODES = [
  { id: 'demo', label: 'Sample tickets' },
  { id: 'clover', label: 'Clover account' },
  { id: 'server', label: 'Kitchen server' },
];

function toDraft(settings) {
  return {
    ...settings,
    lookbackHours: String(settings.lookbackHours),
    warningMinutes: String(settings.warningMinutes),
    lateMinutes: String(settings.lateMinutes),
  };
}

function numberInRange(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function Settings({ visible, settings, labels = [], onClose, onSave, onResetDemo }) {
  const [draft, setDraft] = useState(toDraft(settings));
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft(toDraft(settings));
      setMessage('');
    }
  }, [visible, settings]);

  function update(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleLabel(name) {
    setDraft((prev) => {
      const current = Array.isArray(prev.printerLabels) ? prev.printerLabels : [];
      const has = current.some((label) => label.toLowerCase() === name.toLowerCase());
      return {
        ...prev,
        printerLabels: has ? current.filter((label) => label.toLowerCase() !== name.toLowerCase()) : [...current, name],
      };
    });
  }

  async function save() {
    const warningMinutes = numberInRange(draft.warningMinutes, 5, 1, 180);
    const lateMinutes = Math.max(warningMinutes + 1, numberInRange(draft.lateMinutes, 10, 2, 240));
    const next = {
      ...draft,
      merchantId: String(draft.merchantId || '').trim(),
      accessToken: String(draft.accessToken || '').trim(),
      serverUrl: String(draft.serverUrl || '').trim(),
      pin: String(draft.pin || '').trim(),
      email: String(draft.email || '').trim().toLowerCase(),
      stationFilter: String(draft.stationFilter || '').trim(),
      printerLabels: [...new Set((draft.printerLabels || []).map((label) => String(label).replace(/\s+/g, ' ').trim()).filter(Boolean))],
      lookbackHours: numberInRange(draft.lookbackHours, 18, 1, 72),
      warningMinutes,
      lateMinutes,
      password: '',
    };
    if (next.mode === 'server' && String(draft.password || '').trim()) {
      try {
        const session = await loginServer({ ...next, password: draft.password, sessionToken: '' });
        next.sessionToken = session.token;
        next.restaurantName = session.account.restaurantName;
        next.email = session.account.email;
      } catch (error) {
        setMessage(error.message);
        return;
      }
    }
    onSave(next);
  }

  async function test() {
    setTesting(true);
    setMessage('');
    try {
      if (draft.mode === 'clover') {
        const result = await testClover(draft);
        setMessage(`Connected to ${result.merchantName}. ${result.orderCount} open tickets in the lookback window.`);
      } else if (draft.mode === 'server') {
        let current = draft;
        if (String(draft.password || '').trim()) {
          const session = await loginServer({ ...draft, sessionToken: '' });
          current = { ...draft, sessionToken: session.token, restaurantName: session.account.restaurantName, email: session.account.email };
          setDraft(current);
        }
        const result = await testServer(current);
        if (result.error) setMessage(result.error);
        else setMessage(`Connected to ${result.merchantName}. ${(result.orders || []).length} tickets in the window.`);
      } else {
        setMessage('Sample tickets are ready on this device.');
      }
    } catch (error) {
      setMessage(draft.mode === 'clover' ? describeNetworkError(error) : error.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.top}>
          <Text style={styles.title}>Settings</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Tickets from</Text>
          <View style={styles.modes}>
            {MODES.map((mode) => (
              <Pressable
                key={mode.id}
                style={[styles.mode, draft.mode === mode.id && styles.modeOn]}
                onPress={() => update('mode', mode.id)}
              >
                <Text style={[styles.modeText, draft.mode === mode.id && styles.modeTextOn]}>{mode.label}</Text>
              </Pressable>
            ))}
          </View>

          {draft.mode === 'demo' ? (
            <View style={styles.card}>
              <Text style={styles.help}>
                Sample tickets stay on this device, including a 10-item order with 4 burgers, 2 chicken fingers, 2 steak and cheese, 2 steaks, and 10 fries.
              </Text>
              <Pressable style={styles.secondary} onPress={onResetDemo}>
                <Text style={styles.secondaryText}>Reset sample tickets</Text>
              </Pressable>
            </View>
          ) : null}

          {draft.mode === 'clover' ? (
            <View style={styles.card}>
              <Text style={styles.help}>
                Paste the merchant ID and an access token from the Clover developer dashboard. The token stays on this tablet.
              </Text>
              <Text style={styles.label}>Environment</Text>
              <View style={styles.modes}>
                {Object.entries(ENVIRONMENTS).map(([id, env]) => (
                  <Pressable
                    key={id}
                    style={[styles.mode, draft.environment === id && styles.modeOn]}
                    onPress={() => update('environment', id)}
                  >
                    <Text style={[styles.modeText, draft.environment === id && styles.modeTextOn]}>{env.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Merchant ID" value={draft.merchantId} onChangeText={(value) => update('merchantId', value)} autoCapitalize="characters" />
              <Field label="Access token" value={draft.accessToken} onChangeText={(value) => update('accessToken', value)} secureTextEntry />
              <Field label="Show orders from the last hours" value={draft.lookbackHours} onChangeText={(value) => update('lookbackHours', value)} keyboardType="number-pad" />
            </View>
          ) : null}

          {draft.mode === 'server' ? (
            <View style={styles.card}>
              <Text style={styles.help}>
                {draft.restaurantName
                  ? `Signed in to ${draft.restaurantName}. This screen stays signed in until someone logs out.`
                  : 'On the kitchen server page, choose Log in with Clover. This screen keeps that restaurant until someone logs out.'}
              </Text>
              <Field label="Server address" value={draft.serverUrl} onChangeText={(value) => update('serverUrl', value)} autoCapitalize="none" />
              <Field label="Email" value={draft.email} onChangeText={(value) => update('email', value)} autoCapitalize="none" keyboardType="email-address" />
              <Field label="Password" value={draft.password} onChangeText={(value) => update('password', value)} secureTextEntry />
              <Field label="Kitchen PIN" value={draft.pin} onChangeText={(value) => update('pin', value)} secureTextEntry />
            </View>
          ) : null}

          <View style={styles.card}>
            <Field label="Yellow at minutes" value={draft.warningMinutes} onChangeText={(value) => update('warningMinutes', value)} keyboardType="number-pad" />
            <Field label="Red at minutes" value={draft.lateMinutes} onChangeText={(value) => update('lateMinutes', value)} keyboardType="number-pad" />
            <Text style={styles.label}>Printer labels</Text>
            <Text style={styles.help}>
              Select the labels already on this Clover account. Checked labels are the only items this screen shows. Leave them all off to show every item.
            </Text>
            {(labels || []).length === 0 ? (
              <Text style={styles.help}>
                {draft.mode === 'demo'
                  ? 'Sample labels show up here.'
                  : 'Clover did not send the printer labels for this account. On the token page, check Read inventory and save. The labels already on the account then show up here to select.'}
              </Text>
            ) : (
              <View style={styles.modes}>
                {[...labels].sort((a, b) => a.localeCompare(b)).map((name) => {
                  const on = (draft.printerLabels || []).some((label) => label.toLowerCase() === name.toLowerCase());
                  return (
                    <Pressable
                      key={name}
                      style={[styles.mode, on && styles.modeOn]}
                      onPress={() => toggleLabel(name)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.modeText, on && styles.modeTextOn]}>{on ? `✓ ${name}` : name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Field
              label="Only show items containing"
              value={draft.stationFilter}
              onChangeText={(value) => update('stationFilter', value)}
              placeholder="burger, steak"
            />
            <Toggle label="Count sides and add-ons in the tally" value={draft.includeModifiers} onValueChange={(value) => update('includeModifiers', value)} />
            <Toggle label="Vibrate when a new ticket arrives" value={draft.haptics} onValueChange={(value) => update('haptics', value)} />
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}
          {testing ? <ActivityIndicator color={colors.gold} /> : null}

          <Pressable style={styles.secondary} onPress={test} disabled={testing} accessibilityRole="button">
            <Text style={styles.secondaryText}>Test connection</Text>
          </Pressable>
          <Pressable style={styles.save} onPress={save} accessibilityRole="button">
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#8b93a1"
        style={styles.input}
        autoCorrect={false}
      />
    </View>
  );
}

function Toggle({ label, value, onValueChange }) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.board },
  top: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: colors.white, fontSize: 28, fontWeight: '800' },
  close: { color: colors.gold, fontSize: 18, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  card: {
    backgroundColor: '#1b2029',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  help: { color: '#d5dbe4', fontSize: 16, lineHeight: 22 },
  label: { color: '#9aa6b8', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3a4250',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  modeText: { color: colors.white, fontWeight: '700' },
  modeTextOn: { color: colors.ink },
  field: { marginTop: 8 },
  input: {
    backgroundColor: '#10141b',
    color: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  toggleLabel: { color: colors.white, fontSize: 16, flex: 1 },
  message: { color: colors.white, fontSize: 16, lineHeight: 22 },
  secondary: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a4250',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  save: {
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: colors.white, fontWeight: '800', fontSize: 18 },
});
