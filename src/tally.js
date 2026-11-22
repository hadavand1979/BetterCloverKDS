function canonical(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lineQuantity(line) {
  if (line.qty != null && line.qty !== '') {
    const qty = Number(line.qty);
    if (Number.isFinite(qty) && qty > 0) return qty;
  }
  const sold = Number(line.quantitySold);
  if (Number.isFinite(sold) && sold > 0) return sold;
  return 1;
}

const INSTRUCTION = /^(no\b|without\b|w\/o\b|w\/out\b|wo\b|hold\b|allergy\b|allergic\b|light\b|lite\b|easy\b|sub\b|substitute\b|on the side\b|ots\b|see note\b|see server\b|\*)/i;
const DONENESS = /^(rare|medium rare|med rare|med\. rare|medium|med|medium well|med well|med\. well|well done|well|hot|iced|sweet|unsweet)$/i;

function isInstructionModifier(name) {
  const cleaned = canonical(name);
  if (!cleaned) return true;
  return INSTRUCTION.test(cleaned) || DONENESS.test(cleaned);
}

function groupKey(name) {
  let key = canonical(name).toLowerCase();
  if (key.endsWith('ies') && key.length > 4) return `${key.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes)$/.test(key) && key.length > 4) return key.slice(0, -2);
  if (key.endsWith('s') && !key.endsWith('ss') && key.length > 3) return key.slice(0, -1);
  return key;
}

function pluralizeDisplay(name, count) {
  const cleaned = canonical(name);
  if (!(count > 1)) return cleaned;
  const parts = cleaned.split(' ');
  if (parts.length !== 1) return cleaned;
  const word = parts[0];
  if (/s$/i.test(word) || /[^a-z]/i.test(word)) return cleaned;
  if (/(ch|sh|x|z|s)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function formatCount(count) {
  const rounded = Math.round(Number(count) * 10) / 10;
  if (!Number.isFinite(rounded)) return '0';
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
  return String(rounded);
}

function tallyLines(lines, options = {}) {
  const includeModifiers = options.includeModifiers !== false;
  const map = new Map();
  const order = [];

  function add(name, count, bucket) {
    const label = canonical(name);
    if (!label || !(count > 0)) return;
    const key = groupKey(label);
    let row = map.get(key);
    if (!row) {
      row = { key, name: label, count: 0, bucket };
      map.set(key, row);
      order.push(key);
    }
    row.count += count;
    if (label.length > row.name.length) row.name = label;
    if (bucket === 'item') row.bucket = 'item';
  }

  lines.forEach((line) => {
    if (line.countItem === false) return;
    add(line.name, lineQuantity(line), 'item');
  });

  if (includeModifiers) {
    lines.forEach((line) => {
      const qty = lineQuantity(line);
      (line.modifiers || []).forEach((mod) => {
        const name = typeof mod === 'string' ? mod : mod.name;
        if (isInstructionModifier(name)) return;
        add(name, qty, 'mod');
      });
    });
  }

  const rows = order.map((key) => map.get(key));
  rows.sort((a, b) => {
    if (a.bucket === b.bucket) return 0;
    return a.bucket === 'item' ? -1 : 1;
  });

  return rows.map((row) => ({
    name: pluralizeDisplay(row.name, row.count),
    count: Math.round(row.count * 10) / 10,
  }));
}

function filterWords(value) {
  return String(value || '')
    .split(',')
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

function matchesStation(line, words) {
  if (!words.length) return true;
  const mods = (line.modifiers || [])
    .map((mod) => (typeof mod === 'string' ? mod : mod.name))
    .join(' ');
  const haystack = `${line.name || ''} ${mods}`.toLowerCase();
  return words.some((word) => haystack.includes(word));
}

function unitLabel(line) {
  if (!line.unitName || !line.unitQty) return '';
  const qty = Number(line.unitQty) / 1000;
  if (!Number.isFinite(qty) || qty <= 0) return '';
  return `${formatCount(qty)} ${line.unitName}`;
}

function groupLines(lines) {
  const groups = [];
  const index = new Map();
  lines.forEach((line) => {
    const mods = (line.modifiers || [])
      .map((mod) => canonical(typeof mod === 'string' ? mod : mod.name))
      .filter(Boolean);
    const key = [
      canonical(line.name).toLowerCase(),
      canonical(line.note).toLowerCase(),
      unitLabel(line).toLowerCase(),
      ...mods.map((mod) => mod.toLowerCase()).sort(),
    ].join('|');
    const qty = lineQuantity(line);
    const existing = index.get(key);
    if (existing) {
      existing.qty += qty;
      return;
    }
    const group = {
      qty,
      name: canonical(line.name),
      note: canonical(line.note),
      unit: unitLabel(line),
      modifiers: mods.map((name) => ({ name, instruction: isInstructionModifier(name) })),
    };
    index.set(key, group);
    groups.push(group);
  });
  return groups;
}

function serviceTone(label) {
  const value = canonical(label).toLowerCase();
  if (value.includes('deliv')) return 'delivery';
  if (value.includes('pick')) return 'pickup';
  if (value.includes('go') || value.includes('take')) return 'togo';
  return 'here';
}

function selectedLabels(settings) {
  const raw = settings.printerLabels;
  const list = Array.isArray(raw) ? raw : [];
  return list.map((label) => canonical(label).toLowerCase()).filter(Boolean);
}

function hasLabel(labels, wanted) {
  return (labels || []).some((label) => wanted.includes(canonical(label).toLowerCase()));
}

function applyPrinterLabels(line, wanted) {
  if (!wanted.length) return { ...line, countItem: line.countItem !== false };
  if (hasLabel(line.labels, wanted)) return { ...line, countItem: true };
  const modifiers = (line.modifiers || []).filter((mod) => {
    const labels = typeof mod === 'string' ? [] : mod.labels;
    return hasLabel(labels, wanted);
  });
  if (!modifiers.length) return null;
  return { ...line, modifiers, countItem: false };
}

function stationQuantity(line) {
  const qty = lineQuantity(line);
  if (line.countItem !== false) return qty;
  const mods = (line.modifiers || []).filter((mod) => !isInstructionModifier(typeof mod === 'string' ? mod : mod.name));
  return mods.length ? qty * mods.length : 0;
}

function visibleLines(order, settings = {}) {
  const words = filterWords(settings.stationFilter);
  const wanted = selectedLabels(settings);
  return (order.lines || []).reduce((lines, line) => {
    if (line.refunded || line.hidden || line.fee || line.exchanged) return lines;
    if (!canonical(line.name)) return lines;
    const routed = applyPrinterLabels(line, wanted);
    if (!routed || !matchesStation(routed, words)) return lines;
    lines.push(routed);
    return lines;
  }, []);
}

function kitchenTime(order, lines) {
  const times = (lines || []).map((line) => Number(line.createdTime) || 0).filter((time) => time > 0);
  if (times.length) return Math.min(...times);
  return Number(order.createdTime) || 0;
}

function prepareTicket(order, settings = {}) {
  const lines = visibleLines(order, settings).map((line) => ({ ...line, unit: unitLabel(line) }));
  const includeModifiers = settings.includeModifiers !== false;
  const itemCount = lines.reduce((sum, line) => sum + stationQuantity(line), 0);
  return {
    id: order.id,
    title: order.title,
    orderType: order.orderType || '',
    serviceTone: order.serviceTone || serviceTone(order.orderType),
    serverName: order.serverName || '',
    note: order.note || '',
    createdTime: kitchenTime(order, lines),
    modifiedTime: order.modifiedTime || 0,
    paymentState: order.paymentState || '',
    state: order.state || 'open',
    itemCount,
    lines,
    groups: groupLines(lines),
    tally: tallyLines(lines, { includeModifiers }),
  };
}

function orderRevision(order) {
  return (order.lines || [])
    .filter((line) => line && !line.refunded && !line.hidden && !line.fee && !line.exchanged)
    .map((line) => {
      const mods = (line.modifiers || []).map((mod) => (typeof mod === 'string' ? mod : mod.name)).join(',');
      return `${line.id || ''}:${line.qty}:${line.name}:${line.note || ''}:${mods}`;
    })
    .sort()
    .join('|');
}

function kitchenStatus(events) {
  const latest = new Map();
  (events || []).forEach((event) => {
    const orderId = String(event.orderId || '');
    const lineId = String(event.lineItemId || '');
    const type = String(event.type || '').toLowerCase();
    const ready = type.endsWith('.ready') || type === 'ready';
    const requested = type.endsWith('.requested') || type === 'requested';
    if (!orderId || !lineId || (!ready && !requested)) return;
    const at = Number(event.createdTime || event.clientCreatedTime || 0);
    const key = `${orderId}:${lineId}`;
    const prev = latest.get(key);
    if (!prev || at >= prev.at) latest.set(key, { at, status: ready ? 'ready' : 'requested' });
  });
  const byOrder = {};
  latest.forEach((value, key) => {
    const split = key.indexOf(':');
    const orderId = key.slice(0, split);
    const lineId = key.slice(split + 1);
    if (!byOrder[orderId]) byOrder[orderId] = {};
    byOrder[orderId][lineId] = { status: value.status, at: value.at };
  });
  return byOrder;
}

function statusName(entry) {
  if (!entry) return '';
  return typeof entry === 'string' ? entry : entry.status;
}

function stationDone(order, settings = {}) {
  const status = order.kdsStatus || {};
  const tracked = visibleLines(order, settings).filter((line) => line.id && statusName(status[line.id]));
  return tracked.length > 0 && tracked.every((line) => statusName(status[line.id]) === 'ready');
}

function readyAt(order, settings = {}) {
  const status = order.kdsStatus || {};
  const tracked = visibleLines(order, settings).filter((line) => line.id && statusName(status[line.id]));
  if (!tracked.length || tracked.some((line) => statusName(status[line.id]) !== 'ready')) return 0;
  return tracked.reduce((max, line) => Math.max(max, Number(status[line.id] && status[line.id].at) || 0), 0);
}

function closeTime(order, mark, settings = {}) {
  if (mark && (mark.status === 'reopened' || mark.reopened)) return 0;
  if (mark && mark.closedAt) return Number(mark.closedAt);
  if (mark && mark.status === 'bumped' && mark.at) return Number(mark.at);
  const finished = readyAt(order, settings);
  if (finished) return finished;
  if (String(order.state || '') === 'locked') return Number(order.modifiedTime) || Number(order.createdTime) || 0;
  return 0;
}

function freezeClosedTimes(orders, bumps, settings = {}, now = Date.now()) {
  const next = { ...bumps };
  let changed = false;
  (orders || []).forEach((order) => {
    const mark = next[order.id];
    if (mark && (mark.status === 'reopened' || mark.reopened)) return;
    const bumped = Boolean(mark && mark.status === 'bumped');
    const registerClosed = String(order.state || 'open') === 'locked';
    const kitchenDone = order.kdsStatus ? stationDone(order, settings) : Boolean(order.kitchenDone);
    if (!(bumped || registerClosed || kitchenDone)) return;
    if (mark && mark.closedAt) return;
    const at = closeTime(order, mark, settings) || now;
    next[order.id] = { ...(mark || {}), closedAt: at };
    changed = true;
  });
  return { bumps: next, changed };
}

function applyKitchenStatus(orders, events, settings = {}) {
  const byOrder = Array.isArray(events) ? kitchenStatus(events) : null;
  return (orders || []).map((order) => {
    const next = { ...order, kdsStatus: byOrder ? (byOrder[order.id] || {}) : (order.kdsStatus || {}) };
    next.kitchenDone = stationDone(next, settings);
    return next;
  });
}

function reconcileBumps(orders, bumps) {
  const next = { ...bumps };
  let changed = false;
  orders.forEach((order) => {
    let mark = next[order.id];
    if (!mark) return;
    if (mark.done && typeof mark.done === 'object') {
      const live = new Set((order.lines || []).map((line) => line && String(line.id || '')).filter(Boolean));
      const done = {};
      Object.keys(mark.done).forEach((id) => {
        if (live.has(id)) done[id] = mark.done[id];
      });
      if (Object.keys(done).length !== Object.keys(mark.done).length) {
        mark = { ...mark };
        if (Object.keys(done).length) mark.done = done;
        else delete mark.done;
        changed = true;
      }
    }
    if (mark.status === 'bumped' && mark.revision && mark.revision !== orderRevision(order)) {
      mark = mark.done && Object.keys(mark.done).length ? { done: mark.done } : null;
      changed = true;
    }
    if (!mark || (!mark.status && !(mark.done && Object.keys(mark.done).length) && !mark.closedAt)) {
      delete next[order.id];
      changed = true;
      return;
    }
    if (next[order.id] !== mark) next[order.id] = mark;
  });
  return { bumps: next, changed };
}

function withDone(ticket, order, mark) {
  const local = mark && mark.done && typeof mark.done === 'object' ? mark.done : {};
  const status = order.kdsStatus || {};
  const lines = (ticket.lines || []).map((line) => {
    const id = String(line.id || '');
    const ready = statusName(status[id]) === 'ready';
    return { ...line, done: Boolean(id && (local[id] || ready)) };
  });
  return { ...ticket, lines, groups: groupLines(lines) };
}

function settingsForBoard(settings = {}) {
  if (settings.mode !== 'demo') return settings;
  const { DEMO_LABELS } = require('./demo');
  const allowed = new Set((DEMO_LABELS || []).map((label) => canonical(label).toLowerCase()));
  const printerLabels = (Array.isArray(settings.printerLabels) ? settings.printerLabels : [])
    .filter((label) => allowed.has(canonical(label).toLowerCase()));
  return { ...settings, printerLabels };
}

function boardTickets(orders, bumps, settings = {}) {
  const active = [];
  const closed = [];
  orders.forEach((order) => {
    const mark = bumps[order.id];
    const bumped = Boolean(mark && mark.status === 'bumped');
    const registerClosed = String(order.state || 'open') === 'locked';
    const kitchenDone = order.kdsStatus ? stationDone(order, settings) : Boolean(order.kitchenDone);
    const reopened = Boolean(mark && (mark.status === 'reopened' || mark.reopened));
    const inClosed = bumped || ((registerClosed || kitchenDone) && !reopened);
    const ticket = withDone(prepareTicket(order, inClosed ? { ...settings, stationFilter: '' } : settings), order, mark);
    if (inClosed) {
      closed.push({ ...ticket, bumped, registerClosed, kitchenDone, closedAt: closeTime(order, mark, settings) });
      return;
    }
    if (!ticket.groups.length) return;
    active.push({ ...ticket, held: Boolean(mark && mark.status === 'held') });
  });
  active.sort((a, b) => Number(a.held) - Number(b.held) || a.createdTime - b.createdTime);
  closed.sort((a, b) => b.createdTime - a.createdTime);
  return { active, closed };
}

function tallySentence(rows) {
  return rows.map((row) => `${formatCount(row.count)} ${row.name}`).join(', ');
}

module.exports = {
  canonical,
  lineQuantity,
  isInstructionModifier,
  tallyLines,
  prepareTicket,
  orderRevision,
  applyKitchenStatus,
  reconcileBumps,
  freezeClosedTimes,
  settingsForBoard,
  boardTickets,
  formatCount,
  tallySentence,
  serviceTone,
  collectLabels,
};

function collectLabels(orders) {
  const names = new Set();
  (orders || []).forEach((order) => {
    (order.lines || []).forEach((line) => {
      (line.labels || []).forEach((label) => {
        const cleaned = canonical(label);
        if (cleaned) names.add(cleaned);
      });
      (line.modifiers || []).forEach((mod) => {
        const labels = typeof mod === 'string' ? [] : mod.labels;
        (labels || []).forEach((label) => {
          const cleaned = canonical(label);
          if (cleaned) names.add(cleaned);
        });
      });
    });
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}
