const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { ENVIRONMENTS, environmentFor, fetchMerchantName, fetchOrders, fetchKitchenEvents, fetchPrinterLabels } = require('../src/clover');
const { reconcileBumps, freezeClosedTimes, applyKitchenStatus } = require('../src/tally');
const { createAccountStore } = require('./accounts');

const PORT = Number(process.env.PORT || 8787);
const dataDir = path.join(__dirname, 'data');
const configFile = path.join(dataDir, 'config.json');
const bumpsFile = path.join(dataDir, 'bumps.json');
const accounts = createAccountStore(path.join(dataDir, 'accounts.json'));

const DEFAULT_CONFIG = {
  environment: 'sandbox',
  merchantId: '',
  accessToken: '',
  refreshToken: '',
  accessTokenExpiration: 0,
  refreshTokenExpiration: 0,
  appId: '',
  appSecret: '',
  publicUrl: '',
  lookbackHours: 18,
  pin: '',
  webhookAuth: '',
  verificationCode: '',
};

const boardCache = new Map();
let merchantCache = { id: '', name: '', at: 0 };
const refreshing = new Map();
const oauthStates = new Map();

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { ...fallback };
  }
}

function writeJson(file, value) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function readConfig() {
  return readJson(configFile, DEFAULT_CONFIG);
}

function readBumps() {
  const saved = readJson(bumpsFile, {});
  const cutoff = Date.now() - 36 * 60 * 60 * 1000;
  Object.keys(saved).forEach((id) => {
    if (saved[id]?.status === 'bumped' && saved[id].at < cutoff) delete saved[id];
  });
  return saved;
}

function clearCache() {
  boardCache.delete('legacy');
}

function clearBoardCache(key) {
  boardCache.delete(key);
}

function lanAddresses() {
  const found = [];
  let interfaces = {};
  try {
    interfaces = os.networkInterfaces();
  } catch (error) {
    return found;
  }
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      const v4 = entry.family === 'IPv4' || entry.family === 4;
      if (v4 && !entry.internal) found.push(`http://${entry.address}:${PORT}`);
    });
  });
  return found;
}

function pinOk(req) {
  const pin = readConfig().pin || process.env.KDS_PIN || '';
  if (!pin) return true;
  return req.get('x-kds-pin') === pin;
}

function requirePin(req, res, next) {
  if (pinOk(req)) return next();
  return res.status(401).json({ message: 'Enter the kitchen PIN in Settings on the tablet.' });
}

function expirationMs(value) {
  const numeric = Number(value || 0);
  if (!numeric) return 0;
  return numeric < 1e12 ? numeric * 1000 : numeric;
}

async function refreshTokens(config) {
  const env = environmentFor(config.environment);
  const response = await fetch(new URL('/oauth/v2/refresh', env.api), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: config.appId, refresh_token: config.refreshToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || 'Clover did not refresh the access token. Connect the merchant again.');
  }
  return {
    ...config,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || config.refreshToken,
    accessTokenExpiration: body.access_token_expiration || 0,
    refreshTokenExpiration: body.refresh_token_expiration || 0,
  };
}

async function ensureToken(config, save) {
  if (!config.refreshToken || !config.accessTokenExpiration) return config;
  if (expirationMs(config.accessTokenExpiration) > Date.now() + 120000) return config;
  const key = `${config.merchantId}:${config.appId}`;
  if (!refreshing.has(key)) {
    const job = refreshTokens(config).then((next) => {
      save(next);
      return next;
    }).finally(() => refreshing.delete(key));
    refreshing.set(key, job);
  }
  return refreshing.get(key);
}

async function buildBoardFrom(config, bumps, saveConfig, saveBumps) {
  const ready = await ensureToken(config, saveConfig);
  if (!ready.merchantId || !ready.accessToken) {
    return {
      connected: false,
      merchantName: '',
      orders: [],
      labels: [],
      bumps,
      error: 'Add a Clover merchant ID and access token on this server.',
    };
  }
  const env = environmentFor(ready.environment);
  let merchantName = merchantCache.name;
  if (merchantCache.id !== ready.merchantId || Date.now() - merchantCache.at > 5 * 60 * 1000) {
    merchantName = await fetchMerchantName({
      apiBase: env.api,
      merchantId: ready.merchantId,
      token: ready.accessToken,
    });
    merchantCache = { id: ready.merchantId, name: merchantName, at: Date.now() };
  }
  const [fetched, labels, events] = await Promise.all([
    fetchOrders({
      apiBase: env.api,
      merchantId: ready.merchantId,
      token: ready.accessToken,
      lookbackHours: ready.lookbackHours,
    }),
    fetchPrinterLabels({
      apiBase: env.api,
      merchantId: ready.merchantId,
      token: ready.accessToken,
    }),
    fetchKitchenEvents({
      apiBase: env.api,
      merchantId: ready.merchantId,
      token: ready.accessToken,
      lookbackHours: ready.lookbackHours,
    }).catch(() => []),
  ]);
  const orders = applyKitchenStatus(fetched, events);
  const reconciled = reconcileBumps(orders, bumps);
  const frozen = freezeClosedTimes(orders, reconciled.bumps, {}, Date.now());
  if (reconciled.changed || frozen.changed) saveBumps(frozen.bumps);
  return {
    connected: true,
    merchantName: merchantName || ready.merchantId,
    orders,
    labels,
    bumps: frozen.bumps,
    error: '',
  };
}

async function cachedBoard(key, load, fallbackBumps) {
  const hit = boardCache.get(key);
  if (hit && Date.now() - hit.at < 3000) return hit.board;
  try {
    const board = await load();
    if (board.connected) boardCache.set(key, { at: Date.now(), board });
    return board;
  } catch (error) {
    return {
      connected: false,
      merchantName: hit?.board?.merchantName || merchantCache.name || '',
      orders: hit?.board?.orders || [],
      labels: hit?.board?.labels || [],
      bumps: hit?.board?.bumps || fallbackBumps(),
      error: error.message || 'Could not reach Clover.',
    };
  }
}

function legacyBoard() {
  return cachedBoard(
    'legacy',
    () => buildBoardFrom(readConfig(), readBumps(), (next) => writeJson(configFile, next), (next) => writeJson(bumpsFile, next)),
    readBumps,
  );
}

function accountBoard(account) {
  return cachedBoard(
    account.id,
    () => buildBoardFrom(
      account.config || {},
      account.bumps || {},
      (next) => {
        account.config = next;
        accounts.saveAccount(account);
      },
      (next) => {
        account.bumps = next;
        accounts.saveAccount(account);
      },
    ),
    () => account.bumps || {},
  );
}

function mergeConfig(current, body, req) {
  const environment = ENVIRONMENTS[body.environment] ? body.environment : current.environment;
  const accessToken = String(body.accessToken || '').trim();
  const appSecret = String(body.appSecret || '').trim();
  const next = {
    ...current,
    environment,
    merchantId: String(body.merchantId || '').trim(),
    appId: String(body.appId || '').trim(),
    publicUrl: String(body.publicUrl || '').trim() || `${req.protocol}://${req.get('host')}`,
    lookbackHours: Math.min(72, Math.max(1, Number(body.lookbackHours) || 18)),
    pin: String(body.pin || '').trim(),
    webhookAuth: String(body.webhookAuth || '').trim(),
    accessToken: accessToken || current.accessToken,
    appSecret: appSecret || current.appSecret,
  };
  if (accessToken && accessToken !== current.accessToken) {
    next.refreshToken = '';
    next.accessTokenExpiration = 0;
    next.refreshTokenExpiration = 0;
  }
  return next;
}

function savePostedConfig(body, req) {
  const next = mergeConfig(readConfig(), body, req);
  writeJson(configFile, next);
  clearCache();
  merchantCache = { id: '', name: '', at: 0 };
  return next;
}

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-KDS-Pin, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.use(express.json({ limit: '1mb' }));

function bearerToken(req) {
  const header = req.get('authorization') || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function accountFromRequest(req) {
  return accounts.accountForToken(bearerToken(req));
}

function sendAuthError(res) {
  return res.status(401).json({ message: 'Log in to your restaurant.' });
}

function changeBumps(req, res, change) {
  const account = accountFromRequest(req);
  if (account) {
    const bumps = { ...(account.bumps || {}) };
    change(bumps);
    account.bumps = bumps;
    accounts.saveAccount(account);
    clearBoardCache(account.id);
    return res.json({ ok: true });
  }
  if (!pinOk(req)) return sendAuthError(res);
  const bumps = readBumps();
  change(bumps);
  writeJson(bumpsFile, bumps);
  clearCache();
  return res.json({ ok: true });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'Better Clover KDS' });
});

app.post('/api/signup', (req, res) => {
  try {
    const account = accounts.signup(req.body || {});
    res.json({ account });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const session = accounts.login(req.body || {});
    res.json(session);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
});

app.post('/api/logout', (req, res) => {
  accounts.logout(bearerToken(req));
  res.json({ ok: true });
});

app.get('/api/restaurant', (req, res) => {
  const account = accountFromRequest(req);
  if (!account) return sendAuthError(res);
  res.json({ ...accounts.publicAccount(account), addresses: lanAddresses() });
});

app.post('/api/restaurant', (req, res) => {
  const account = accountFromRequest(req);
  if (!account) return sendAuthError(res);
  const body = req.body || {};
  if (body.restaurantName) account.restaurantName = String(body.restaurantName).trim() || account.restaurantName;
  account.config = {
    ...(account.config || {}),
    ...(() => {
      const saved = mergeConfig(account.config || {}, body, req);
      delete saved.pin;
      return saved;
    })(),
  };
  accounts.saveAccount(account);
  clearBoardCache(account.id);
  res.json({ ok: true, account: accounts.publicAccount(account) });
});

app.get('/api/status', requirePin, (req, res) => {
  const config = readConfig();
  res.json({
    connected: Boolean(config.merchantId && config.accessToken),
    merchantName: merchantCache.name || '',
    merchantId: config.merchantId,
    environment: config.environment,
    hasToken: Boolean(config.accessToken),
    hasSecret: Boolean(config.appSecret),
    appId: config.appId,
    publicUrl: config.publicUrl,
    lookbackHours: config.lookbackHours,
    pinRequired: Boolean(config.pin),
    verificationCode: config.verificationCode || '',
    addresses: lanAddresses(),
    error: '',
  });
});

app.post('/api/config', requirePin, (req, res) => {
  const saved = savePostedConfig(req.body || {}, req);
  res.json({ ok: true, merchantId: saved.merchantId, environment: saved.environment });
});

app.post('/api/test', async (req, res) => {
  const account = accountFromRequest(req);
  if (account) {
    if (req.body && Object.keys(req.body).length) {
      account.config = mergeConfig(account.config || {}, req.body, req);
      delete account.config.pin;
      accounts.saveAccount(account);
      clearBoardCache(account.id);
    }
    const board = await accountBoard(account);
    return res.status(board.connected ? 200 : 400).json({
      connected: board.connected,
      merchantName: board.merchantName,
      restaurantName: account.restaurantName,
      orderCount: board.orders.length,
      error: board.error,
    });
  }
  if (!pinOk(req)) return sendAuthError(res);
  if (req.body && Object.keys(req.body).length) savePostedConfig(req.body, req);
  clearCache();
  const board = await legacyBoard();
  return res.status(board.connected ? 200 : 400).json({
    connected: board.connected,
    merchantName: board.merchantName,
    orderCount: board.orders.length,
    error: board.error,
  });
});

app.get('/api/board', async (req, res) => {
  const account = accountFromRequest(req);
  if (account) {
    const board = await accountBoard(account);
    return res.json({ ...board, restaurantName: account.restaurantName });
  }
  if (!pinOk(req)) return sendAuthError(res);
  return res.json(await legacyBoard());
});

function markedDone(current) {
  return current && current.done && typeof current.done === 'object' ? current.done : null;
}

app.post('/api/tickets/:id/bump', (req, res) => {
  changeBumps(req, res, (bumps) => {
    const at = Date.now();
    const current = bumps[req.params.id] || {};
    bumps[req.params.id] = { ...current, status: 'bumped', at, revision: req.body && req.body.revision, closedAt: at };
  });
});

app.post('/api/tickets/:id/recall', (req, res) => {
  changeBumps(req, res, (bumps) => {
    const done = markedDone(bumps[req.params.id]);
    if (done && Object.keys(done).length) bumps[req.params.id] = { done };
    else delete bumps[req.params.id];
  });
});

app.post('/api/tickets/:id/reopen', (req, res) => {
  changeBumps(req, res, (bumps) => {
    const current = bumps[req.params.id] || {};
    bumps[req.params.id] = { ...current, status: 'reopened', at: Date.now() };
  });
});

app.post('/api/tickets/:id/hold', (req, res) => {
  changeBumps(req, res, (bumps) => {
    const current = bumps[req.params.id] || {};
    if (req.body && req.body.held === false) {
      if (req.body.reopened) bumps[req.params.id] = { ...current, status: 'reopened', at: Date.now() };
      else if (markedDone(current)) bumps[req.params.id] = { done: current.done };
      else delete bumps[req.params.id];
    } else {
      bumps[req.params.id] = { ...current, status: 'held', at: Date.now(), reopened: Boolean(req.body && req.body.reopened) };
    }
  });
});

app.post('/api/tickets/:id/done', (req, res) => {
  changeBumps(req, res, (bumps) => {
    const lineId = String(req.body && req.body.lineId || '');
    if (!lineId) return;
    const current = bumps[req.params.id] || {};
    const done = { ...(current.done || {}) };
    if (req.body && req.body.done === false) delete done[lineId];
    else done[lineId] = Date.now();
    const next = { ...current };
    if (Object.keys(done).length) next.done = done;
    else delete next.done;
    if (!next.status && !next.done && !next.closedAt) delete bumps[req.params.id];
    else bumps[req.params.id] = next;
  });
});

app.get('/oauth/start', (req, res) => {
  const account = accounts.accountForToken(String(req.query.session || ''));
  const developer = readConfig();
  const config = {
    ...(account ? account.config || {} : developer),
    appId: (account && account.config && account.config.appId) || developer.appId,
    appSecret: (account && account.config && account.config.appSecret) || developer.appSecret,
    environment: (account && account.config && account.config.environment) || developer.environment,
    publicUrl: (account && account.config && account.config.publicUrl) || developer.publicUrl,
  };
  if (!config.appId || !config.appSecret) {
    return res.redirect('/?error=Add%20the%20App%20ID%20and%20App%20Secret%20first');
  }
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { at: Date.now(), session: account ? String(req.query.session || '') : '' });
  const env = environmentFor(config.environment);
  const redirect = `${(config.publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/oauth/callback`;
  const url = new URL('/oauth/v2/authorize', env.authorize);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return res.redirect(url.toString());
});

app.get('/oauth/callback', async (req, res) => {
  const started = oauthStates.get(req.query.state);
  oauthStates.delete(req.query.state);
  if (!started || Date.now() - started.at > 10 * 60 * 1000) {
    return res.status(400).send('The Clover connection expired. Start it again from the kitchen server page.');
  }
  const account = started.session ? accounts.accountForToken(started.session) : null;
  if (started.session && !account) {
    return res.status(400).send('Log in to the restaurant again, then connect Clover.');
  }
  const config = account ? (account.config || {}) : readConfig();
  try {
    const env = environmentFor(config.environment);
    const response = await fetch(new URL('/oauth/v2/token', env.api), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.appId,
        client_secret: config.appSecret,
        code: req.query.code,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Clover did not return an access token.');
    const next = {
      ...config,
      merchantId: req.query.merchant_id || config.merchantId,
      accessToken: body.access_token,
      refreshToken: body.refresh_token || '',
      accessTokenExpiration: body.access_token_expiration || 0,
      refreshTokenExpiration: body.refresh_token_expiration || 0,
    };
    const merchantId = req.query.merchant_id || config.merchantId;
    let restaurantName = '';
    try {
      restaurantName = await fetchMerchantName({
        apiBase: env.api,
        merchantId,
        token: body.access_token,
      });
    } catch (error) {
      restaurantName = '';
    }
    const session = accounts.loginWithClover({
      merchantId,
      restaurantName,
      environment: config.environment || readConfig().environment || 'na',
      config: { ...next, merchantId },
    });
    clearBoardCache(accounts.accountForToken(session.token).id);
    if (!account) {
      writeJson(configFile, next);
      clearCache();
    }
    return res.redirect(`/#session=${session.token}`);
  } catch (error) {
    return res.status(400).send(error.message);
  }
});

app.post('/webhooks', (req, res) => {
  const config = readConfig();
  if (req.body && req.body.verificationCode) {
    writeJson(configFile, { ...config, verificationCode: req.body.verificationCode });
    return res.json({ received: true });
  }
  if (config.webhookAuth && req.get('x-clover-auth') !== config.webhookAuth) {
    return res.status(401).end();
  }
  clearCache();
  return res.json({ received: true });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, '0.0.0.0', () => {
  const addresses = lanAddresses();
  console.log(`Better Clover KDS server on http://localhost:${PORT}`);
  addresses.forEach((address) => console.log(`Tablets can use ${address}`));
});
