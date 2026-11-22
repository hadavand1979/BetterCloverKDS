function normalizeServerUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/$/, '');
}

function pinHeaders(settings, hasBody) {
  const headers = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (settings.sessionToken) headers.Authorization = `Bearer ${settings.sessionToken}`;
  else if (settings.pin) headers['X-KDS-Pin'] = settings.pin;
  return headers;
}

async function errorMessage(response) {
  try {
    const body = await response.json();
    return body.message || `The kitchen server returned ${response.status}`;
  } catch (error) {
    return `The kitchen server returned ${response.status}`;
  }
}

function describe(error) {
  const message = String(error && error.message ? error.message : error);
  if (message === 'Failed to fetch' || message.includes('Network request failed')) {
    return 'Could not reach the kitchen server. Check the address and that this device is on the same Wi-Fi.';
  }
  return message || 'Could not reach the kitchen server.';
}

async function request(settings, path, options = {}) {
  const base = normalizeServerUrl(settings.serverUrl);
  if (!base) throw new Error('Enter the kitchen server address.');
  try {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...pinHeaders(settings, Boolean(options.body)),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json();
  } catch (error) {
    if (error && error.message && error.message.startsWith('The kitchen server')) throw error;
    if (error && error.message && error.message.startsWith('Enter the kitchen')) throw error;
    throw new Error(describe(error));
  }
}

function fetchServerBoard(settings) {
  return request(settings, '/api/board');
}

function testServer(settings) {
  return request(settings, '/api/board');
}

function loginServer(settings) {
  return request({ ...settings, sessionToken: '' }, '/api/login', {
    method: 'POST',
    body: JSON.stringify({
      email: settings.email,
      password: settings.password,
    }),
  });
}

function postTicket(settings, id, action, body) {
  return request(settings, `/api/tickets/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

module.exports = {
  normalizeServerUrl,
  fetchServerBoard,
  testServer,
  loginServer,
  postTicket,
};
