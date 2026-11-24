import { useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import { loadBumps, saveBumps } from './storage';

const { createDemoOrders, DEMO_LABELS } = require('./demo');
const { fetchOrders, fetchKitchenEvents, fetchMerchantName, fetchPrinterLabels, environmentFor, describeNetworkError } = require('./clover');
const { reconcileBumps, freezeClosedTimes, collectLabels, applyKitchenStatus, orderRevision, orderLookbackHours, arrivedTicketIds } = require('./tally');
const { playChime, prepareChime } = require('./chime');

function mergeLabels(catalog, orders) {
  return [...new Set([...(catalog || []), ...collectLabels(orders)])].sort((a, b) => a.localeCompare(b));
}
const { fetchServerBoard, postTicket } = require('./serverClient');

function pulse(pattern) {
  if (Platform.OS === 'web') return;
  try {
    Vibration.vibrate(pattern);
  } catch (error) {
    // Haptics can be unavailable when the device is in low power mode.
  }
}

export function useKitchen(settings) {
  const [orders, setOrders] = useState([]);
  const [bumps, setBumps] = useState({});
  const [merchantName, setMerchantName] = useState('');
  const [labels, setLabels] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const demoRef = useRef(null);
  const seenRef = useRef(new Set());
  const primedRef = useRef(false);
  const inflightRef = useRef(false);
  const hydratedRef = useRef(false);
  const bumpsRef = useRef({});
  const ordersRef = useRef([]);
  const settingsRef = useRef(settings);
  const metaRef = useRef({ key: '', name: '', labels: [], at: 0 });
  const pauseUntilRef = useRef(0);
  const accountKeyRef = useRef(`${settings.mode}:${settings.environment}:${settings.merchantId}`);
  const heldOrdersRef = useRef(null);
  const filterKeyRef = useRef('');
  settingsRef.current = settings;
  bumpsRef.current = bumps;
  ordersRef.current = orders;

  useEffect(() => {
    let cancel = false;
    primedRef.current = false;
    seenRef.current = new Set();
    demoRef.current = null;
    if (settings.mode === 'server') {
      hydratedRef.current = true;
      return undefined;
    }
    hydratedRef.current = false;
    loadBumps(settings).then((stored) => {
      if (cancel) return;
      hydratedRef.current = true;
      setBumps((current) => ({ ...stored, ...current }));
    });
    return () => {
      cancel = true;
    };
  }, [settings.mode, settings.environment, settings.merchantId]);

  useEffect(() => {
    if (!hydratedRef.current || settings.mode === 'server') return undefined;
    saveBumps(settings, bumps).catch(() => {});
    return undefined;
  }, [bumps, settings]);

  async function refresh() {
    const current = settingsRef.current;
    if (current.mode === 'demo') {
      if (!demoRef.current) demoRef.current = createDemoOrders(Date.now());
      const reconciled = reconcileBumps(demoRef.current, bumpsRef.current);
      const frozen = freezeClosedTimes(demoRef.current, reconciled.bumps, current, Date.now());
      if (reconciled.changed || frozen.changed) setBumps(frozen.bumps);
      setOrders(demoRef.current);
      setLabels(mergeLabels(DEMO_LABELS, demoRef.current));
      setMerchantName('Sample kitchen');
      setError('');
      return;
    }

    if (current.mode === 'server') {
      const board = await fetchServerBoard(current);
      setOrders(applyKitchenStatus(board.orders || [], null, current));
      setLabels(mergeLabels(board.labels, board.orders));
      setBumps(board.bumps || {});
      setMerchantName(board.merchantName || board.restaurantName || 'Kitchen server');
      setError(board.error || '');
      return;
    }

    const merchantId = String(current.merchantId || '').trim();
    const token = String(current.accessToken || '').trim();
    if (!merchantId || !token) {
      throw new Error('Enter the Clover merchant ID and access token in Settings.');
    }
    const env = environmentFor(current.environment);
    const lookbackHours = orderLookbackHours(current);
    const orders = await fetchOrders({
      apiBase: env.api,
      merchantId,
      token,
      lookbackHours,
    });
    const events = await fetchKitchenEvents({
      apiBase: env.api,
      merchantId,
      token,
      lookbackHours,
    });
    const metaKey = `${current.environment}:${merchantId}`;
    const meta = metaRef.current.key === metaKey ? metaRef.current : { key: metaKey, name: '', labels: [], at: 0 };
    const nextOrders = applyKitchenStatus(orders, events, current);
    const reconciled = reconcileBumps(nextOrders, bumpsRef.current);
    const frozen = freezeClosedTimes(nextOrders, reconciled.bumps, current, Date.now());
    if (reconciled.changed || frozen.changed) setBumps(frozen.bumps);
    setOrders(nextOrders);
    setLabels(mergeLabels(meta.labels, nextOrders));
    setMerchantName(meta.name || merchantId);
    setError('');
    if (meta.key !== metaRef.current.key || Date.now() - meta.at > 10 * 60 * 1000) {
      const name = await fetchMerchantName({ apiBase: env.api, merchantId, token });
      const catalog = await fetchPrinterLabels({ apiBase: env.api, merchantId, token });
      metaRef.current = { key: metaKey, name: name || meta.name, labels: catalog, at: Date.now() };
      setLabels(mergeLabels(catalog, nextOrders));
      setMerchantName(metaRef.current.name || merchantId);
    }
  }

  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (stopped || inflightRef.current || Date.now() < pauseUntilRef.current) return;
      inflightRef.current = true;
      try {
        await refresh();
        pauseUntilRef.current = 0;
      } catch (err) {
        if (err && err.status === 429) pauseUntilRef.current = Date.now() + (err.retryAfterMs || 20_000);
        setError(settingsRef.current.mode === 'clover' ? describeNetworkError(err) : err.message);
      } finally {
        inflightRef.current = false;
        if (!stopped) setLoading(false);
      }
    }
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [settings.mode, settings.environment, settings.merchantId, settings.accessToken, settings.serverUrl, settings.pin, settings.lookbackHours, settings.closedWindow]);

  useEffect(() => {
    if (settings.chime) prepareChime();
  }, [settings.chime]);

  useEffect(() => {
    if (loading) return;
    const accountKey = `${settings.mode}:${settings.environment}:${settings.merchantId}`;
    if (accountKey !== accountKeyRef.current) {
      accountKeyRef.current = accountKey;
      primedRef.current = false;
      seenRef.current = new Set();
      heldOrdersRef.current = orders;
    }
    if (!primedRef.current && heldOrdersRef.current && orders === heldOrdersRef.current) return;
    const filterKey = JSON.stringify([
      settings.mode,
      settings.stationFilter || '',
      ...(Array.isArray(settings.printerLabels) ? settings.printerLabels : []),
    ]);
    if (filterKey !== filterKeyRef.current) {
      filterKeyRef.current = filterKey;
      primedRef.current = false;
      seenRef.current = new Set();
    }
    if (!primedRef.current) {
      arrivedTicketIds(seenRef.current, orders, bumps, settings, false);
      primedRef.current = true;
      heldOrdersRef.current = null;
      return;
    }
    const fresh = arrivedTicketIds(seenRef.current, orders, bumps, settings, true);
    if (!fresh.length) return;
    if (settings.haptics) pulse([0, 70, 50, 70]);
    if (settings.chime) playChime();
  }, [orders, bumps, loading, settings]);

  async function bump(ticket) {
    const revision = orderRevision(ticket);
    if (settings.mode === 'server') {
      await postTicket(settings, ticket.id, 'bump', { revision });
      await refresh();
      return;
    }
    const at = Date.now();
    setBumps((prev) => ({
      ...prev,
      [ticket.id]: { ...(prev[ticket.id] || {}), status: 'bumped', at, revision, closedAt: at },
    }));
    if (settings.haptics) pulse(30);
  }

  function orderStaysClosed(id) {
    const order = ordersRef.current.find((item) => item.id === id);
    return String(order?.state || 'open') === 'locked' || Boolean(order?.kitchenDone);
  }

  async function recall(id) {
    const locked = orderStaysClosed(id);
    if (settings.mode === 'server') {
      await postTicket(settings, id, locked ? 'reopen' : 'recall');
      await refresh();
      return;
    }
    setBumps((prev) => {
      const next = { ...prev };
      const current = next[id] || {};
      if (locked) next[id] = { ...current, status: 'reopened', at: Date.now() };
      else if (current.done && Object.keys(current.done).length) next[id] = { done: current.done };
      else delete next[id];
      return next;
    });
  }

  async function hold(ticket, held) {
    const locked = String(ticket.state || 'open') === 'locked' || Boolean(ticket.kitchenDone);
    if (settings.mode === 'server') {
      await postTicket(settings, ticket.id, 'hold', { held, reopened: locked });
      await refresh();
      return;
    }
    setBumps((prev) => {
      const next = { ...prev };
      const current = next[ticket.id] || {};
      if (held) next[ticket.id] = { ...current, status: 'held', at: Date.now(), reopened: locked };
      else if (locked) next[ticket.id] = { ...current, status: 'reopened', at: Date.now() };
      else if (current.done && Object.keys(current.done).length) next[ticket.id] = { done: current.done };
      else delete next[ticket.id];
      return next;
    });
  }

  async function toggleLine(ticket, line) {
    const lineId = String(line && line.id || '');
    if (!lineId) return;
    const done = !line.done;
    if (settings.mode === 'server') {
      await postTicket(settings, ticket.id, 'done', { lineId, done });
      await refresh();
      return;
    }
    setBumps((prev) => {
      const current = prev[ticket.id] || {};
      const marks = { ...(current.done || {}) };
      if (done) marks[lineId] = Date.now();
      else delete marks[lineId];
      const nextMark = { ...current };
      if (Object.keys(marks).length) nextMark.done = marks;
      else delete nextMark.done;
      if (!nextMark.status && !nextMark.done && !nextMark.closedAt) {
        const next = { ...prev };
        delete next[ticket.id];
        return next;
      }
      return { ...prev, [ticket.id]: nextMark };
    });
    if (settings.haptics) pulse(15);
  }

  function resetDemo() {
    demoRef.current = createDemoOrders(Date.now());
    setOrders(demoRef.current);
    setBumps({});
    seenRef.current = new Set(demoRef.current.map((order) => order.id));
    primedRef.current = true;
  }

  return {
    orders,
    bumps,
    labels,
    merchantName,
    error,
    loading,
    refresh,
    bump,
    recall,
    hold,
    toggleLine,
    resetDemo,
  };
}
