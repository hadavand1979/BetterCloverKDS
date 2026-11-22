const { canonical, lineQuantity, serviceTone } = require('./tally');

const ENVIRONMENTS = {
  sandbox: {
    label: 'Sandbox',
    api: 'https://apisandbox.dev.clover.com',
    authorize: 'https://sandbox.dev.clover.com',
  },
  na: {
    label: 'United States and Canada',
    api: 'https://api.clover.com',
    authorize: 'https://www.clover.com',
  },
  eu: {
    label: 'Europe',
    api: 'https://api.eu.clover.com',
    authorize: 'https://www.eu.clover.com',
  },
  la: {
    label: 'Latin America',
    api: 'https://api.la.clover.com',
    authorize: 'https://www.la.clover.com',
  },
};

function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.elements)) return value.elements;
  return [];
}

function flag(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function tagNames(source) {
  if (!source) return [];
  const tags = asList(source.tags || source);
  return tags.map((tag) => canonical(typeof tag === 'string' ? tag : tag.name)).filter(Boolean);
}

function labelNames(...groups) {
  const names = [];
  groups.flat().forEach((name) => {
    const cleaned = canonical(name);
    if (cleaned && !names.includes(cleaned)) names.push(cleaned);
  });
  return names;
}

function normalizeLine(line) {
  const modifiers = asList(line.modifications || line.modifiers)
    .map((mod) => ({
      name: canonical(mod.name || mod.alternateName || (mod.modifier && mod.modifier.name) || ''),
      labels: labelNames(tagNames(mod), tagNames(mod.modifier), tagNames(mod.item), mod.labels),
    }))
    .filter((mod) => mod.name);
  return {
    id: line.id,
    name: canonical(line.name || line.alternateName || 'Item'),
    qty: lineQuantity(line),
    note: canonical(line.note || ''),
    modifiers,
    refunded: flag(line.refunded),
    hidden: flag(line.hidden),
    fee: flag(line.isOrderFee) || flag(line.orderFee),
    exchanged: flag(line.exchanged),
    unitName: line.unitName || '',
    unitQty: line.unitQty == null ? null : Number(line.unitQty),
    createdTime: Number(line.createdTime || line.clientCreatedTime || 0),
    labels: labelNames(tagNames(line.item), tagNames(line), line.labels),
  };
}

function customerName(order) {
  const customer = asList(order.customers)[0] || {};
  return canonical([customer.firstName, customer.lastName].filter(Boolean).join(' '));
}

function normalizeOrder(order) {
  if (!order || !order.id) return null;
  const state = String(order.state || '').toLowerCase();
  if (state !== 'open' && state !== 'locked') return null;
  const lines = asList(order.lineItems).map(normalizeLine);
  const active = lines.filter((line) => !line.refunded && !line.hidden && !line.fee && !line.exchanged && line.name);
  if (!active.length) return null;
  const employee = order.employee && typeof order.employee === 'object' ? order.employee.name : '';
  const orderType = order.orderType && typeof order.orderType === 'object' ? order.orderType.label || '' : '';
  const title = canonical(order.title) || customerName(order) || `Order ${String(order.id).slice(-4)}`;
  return {
    id: String(order.id),
    title,
    orderType: canonical(orderType),
    serviceTone: serviceTone(orderType),
    serverName: canonical(employee || ''),
    note: canonical(order.note || ''),
    createdTime: Number(order.createdTime || order.clientCreatedTime || Date.now()),
    modifiedTime: Number(order.modifiedTime || order.createdTime || order.clientCreatedTime || 0),
    paymentState: String(order.paymentState || '').toUpperCase(),
    state,
    lines,
  };
}

async function cloverFetch(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (error) {
      body = { message: text.slice(0, 200) };
    }
    if (!response.ok) {
      const failure = new Error(body?.message || `Clover returned ${response.status}`);
      failure.status = response.status;
      throw failure;
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Clover took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function environmentFor(name) {
  return ENVIRONMENTS[name] || ENVIRONMENTS.sandbox;
}

async function fetchMerchantName({ apiBase, merchantId, token }) {
  try {
    const body = await cloverFetch(new URL(`/v3/merchants/${encodeURIComponent(merchantId)}`, apiBase), token);
    return body?.name || '';
  } catch (error) {
    if (error.status === 401) throw error;
    return '';
  }
}

async function fetchOrderPage({ apiBase, merchantId, token, since, offset, expand }) {
  const url = new URL(`/v3/merchants/${encodeURIComponent(merchantId)}/orders`, apiBase);
  url.searchParams.append('filter', `createdTime>=${since}`);
  url.searchParams.set('expand', expand);
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', String(offset));
  return asList(await cloverFetch(url, token));
}

async function fetchOrders({ apiBase, merchantId, token, lookbackHours }) {
  const since = Date.now() - Number(lookbackHours || 18) * 60 * 60 * 1000;
  const plain = 'lineItems.modifications,orderType,employee,customers';
  const withTags = 'lineItems.modifications,lineItems.item.tags,orderType,employee,customers';
  let expand = withTags;
  const orders = [];
  let offset = 0;
  while (orders.length < 400) {
    let batch;
    try {
      batch = await fetchOrderPage({ apiBase, merchantId, token, since, offset, expand });
    } catch (error) {
      const canDropTags = expand !== plain && (error.status === 400 || error.status === 401 || error.status === 403);
      if (!canDropTags) throw error;
      expand = plain;
      batch = await fetchOrderPage({ apiBase, merchantId, token, since, offset, expand });
    }
    orders.push(...batch);
    if (batch.length < 100) break;
    offset += batch.length;
  }
  return orders.map(normalizeOrder).filter(Boolean);
}

async function fetchKitchenEvents({ apiBase, merchantId, token, lookbackHours }) {
  const since = Date.now() - Number(lookbackHours || 18) * 60 * 60 * 1000;
  const events = [];
  let offset = 0;
  try {
    while (events.length < 4000) {
      const url = new URL(`/v3/merchants/${encodeURIComponent(merchantId)}/line_item_events`, apiBase);
      url.searchParams.append('filter', `createdTime>=${since}`);
      url.searchParams.set('limit', '1000');
      url.searchParams.set('offset', String(offset));
      const batch = asList(await cloverFetch(url, token));
      events.push(...batch);
      if (batch.length < 1000) break;
      offset += batch.length;
    }
  } catch (error) {
    return events;
  }
  return events;
}

async function fetchPrinterLabels({ apiBase, merchantId, token }) {
  const names = [];
  try {
    const url = new URL(`/v3/merchants/${encodeURIComponent(merchantId)}/tags`, apiBase);
    url.searchParams.set('expand', 'printers');
    url.searchParams.set('limit', '1000');
    const tags = asList(await cloverFetch(url, token));
    const onPrinters = tags.filter((tag) => asList(tag && tag.printers).length > 0);
    const source = onPrinters.length ? onPrinters : tags;
    names.push(...source.map((tag) => tag && tag.name));
  } catch (error) {
    // A label lookup must not block the kitchen tickets.
  }
  if (!names.length) {
    try {
      const url = new URL(`/v3/merchants/${encodeURIComponent(merchantId)}/printers`, apiBase);
      url.searchParams.set('expand', 'tags');
      url.searchParams.set('limit', '100');
      asList(await cloverFetch(url, token)).forEach((printer) => {
        asList(printer && printer.tags).forEach((tag) => names.push(tag && tag.name));
      });
    } catch (error) {
      // Printers are a second way to read the same labels.
    }
  }
  return labelNames(names);
}

async function testClover(settings) {
  const merchantId = canonical(settings.merchantId);
  const token = String(settings.accessToken || '').trim();
  if (!merchantId || !token) {
    throw new Error('Enter the merchant ID and access token first.');
  }
  const env = environmentFor(settings.environment);
  const merchantName = await fetchMerchantName({ apiBase: env.api, merchantId, token });
  const orders = await fetchOrders({
    apiBase: env.api,
    merchantId,
    token,
    lookbackHours: settings.lookbackHours,
  });
  return {
    merchantName: merchantName || merchantId,
    orderCount: orders.length,
  };
}

function describeNetworkError(error) {
  const message = String(error && error.message ? error.message : error);
  if (message === 'Failed to fetch' || message.includes('Network request failed')) {
    return 'Could not reach Clover. Check the internet connection on this device.';
  }
  if (error && error.status === 401) return 'Clover refused the access token. Create a new token and paste it again.';
  if (error && error.status === 403) return 'This token can read the merchant, but orders need the Read orders permission.';
  return message || 'Could not reach Clover.';
}

module.exports = {
  ENVIRONMENTS,
  asList,
  normalizeOrder,
  fetchMerchantName,
  fetchOrders,
  fetchKitchenEvents,
  fetchPrinterLabels,
  testClover,
  environmentFor,
  describeNetworkError,
};
