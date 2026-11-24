import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'better-clover-kds-settings';
const BUMPS_PREFIX = 'better-clover-kds-bumps';

export const DEFAULT_SETTINGS = {
  mode: 'demo',
  environment: 'na',
  merchantId: '',
  accessToken: '',
  serverUrl: '',
  pin: '',
  email: '',
  sessionToken: '',
  restaurantName: '',
  lookbackHours: 18,
  closedWindow: 'today',
  warningMinutes: 5,
  lateMinutes: 10,
  includeModifiers: true,
  chime: false,
  haptics: true,
  stationFilter: '',
  printerLabels: [],
};

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function bumpStorageKey(settings) {
  if (!settings || settings.mode === 'server') return null;
  if (settings.mode === 'demo') return `${BUMPS_PREFIX}:demo`;
  return `${BUMPS_PREFIX}:${settings.environment}:${settings.merchantId}`;
}

export async function loadBumps(settings) {
  const key = bumpStorageKey(settings);
  if (!key) return {};
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

export async function saveBumps(settings, bumps) {
  const key = bumpStorageKey(settings);
  if (!key) return;
  await AsyncStorage.setItem(key, JSON.stringify(bumps));
}

export async function clearBumps(settings) {
  const key = bumpStorageKey(settings);
  if (!key) return;
  await AsyncStorage.removeItem(key);
}
