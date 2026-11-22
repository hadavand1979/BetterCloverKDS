const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function createAccountStore(file) {
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      };
    } catch (error) {
      return { accounts: [], sessions: {} };
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 32).toString('hex');
    return { salt, hash };
  }

  function passwordMatches(password, account) {
    const next = crypto.scryptSync(password, account.passwordSalt, 32);
    const prev = Buffer.from(account.passwordHash, 'hex');
    return next.length === prev.length && crypto.timingSafeEqual(next, prev);
  }

  function publicAccount(account) {
    const config = account.config || {};
    return {
      id: account.id,
      email: account.email,
      restaurantName: account.restaurantName,
      environment: config.environment || 'na',
      merchantId: config.merchantId || '',
      lookbackHours: config.lookbackHours || 18,
      appId: config.appId || '',
      publicUrl: config.publicUrl || '',
      hasToken: Boolean(config.accessToken),
      hasSecret: Boolean(config.appSecret),
      connected: Boolean(config.merchantId && config.accessToken),
    };
  }

  function signup({ email, password, restaurantName }) {
    const cleanedEmail = String(email || '').trim().toLowerCase();
    const name = String(restaurantName || '').trim();
    const secret = String(password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      throw new Error('Enter a valid email address.');
    }
    if (secret.length < 8) throw new Error('Use a password of at least 8 characters.');
    if (!name) throw new Error('Enter the restaurant name.');
    const data = read();
    if (data.accounts.some((account) => account.email === cleanedEmail)) {
      throw new Error('A restaurant already uses that email.');
    }
    const { salt, hash } = hashPassword(secret);
    const account = {
      id: crypto.randomBytes(12).toString('hex'),
      email: cleanedEmail,
      passwordSalt: salt,
      passwordHash: hash,
      restaurantName: name,
      config: {
        environment: 'na',
        merchantId: '',
        accessToken: '',
        refreshToken: '',
        accessTokenExpiration: 0,
        refreshTokenExpiration: 0,
        appId: '',
        appSecret: '',
        publicUrl: '',
        lookbackHours: 18,
        webhookAuth: '',
        verificationCode: '',
      },
      bumps: {},
    };
    data.accounts.push(account);
    write(data);
    return publicAccount(account);
  }

  function issueSession(data, account) {
    const token = crypto.randomBytes(24).toString('hex');
    data.sessions[token] = { accountId: account.id, createdAt: Date.now() };
    return token;
  }

  function login({ email, password }) {
    const cleanedEmail = String(email || '').trim().toLowerCase();
    const data = read();
    const account = data.accounts.find((item) => item.email === cleanedEmail);
    if (!account || !passwordMatches(String(password || ''), account)) {
      throw new Error('That email or password is wrong.');
    }
    const token = issueSession(data, account);
    write(data);
    return { token, account: publicAccount(account) };
  }

  function loginWithClover({ merchantId, restaurantName, environment, config }) {
    const id = String(merchantId || '').trim();
    if (!id) throw new Error('Clover did not send the restaurant.');
    const data = read();
    let account = data.accounts.find((item) => item.config && item.config.merchantId === id);
    if (!account) {
      account = {
        id: crypto.randomBytes(12).toString('hex'),
        email: '',
        passwordSalt: '',
        passwordHash: '',
        restaurantName: String(restaurantName || '').trim() || 'Restaurant',
        config: {
          environment: environment || 'na',
          merchantId: id,
          accessToken: '',
          refreshToken: '',
          accessTokenExpiration: 0,
          refreshTokenExpiration: 0,
          appId: '',
          appSecret: '',
          publicUrl: '',
          lookbackHours: 18,
          webhookAuth: '',
          verificationCode: '',
        },
        bumps: {},
      };
      data.accounts.push(account);
    }
    if (restaurantName) account.restaurantName = String(restaurantName).trim() || account.restaurantName;
    account.config = { ...(account.config || {}), ...(config || {}), merchantId: id };
    const token = issueSession(data, account);
    write(data);
    return { token, account: publicAccount(account) };
  }

  function logout(token) {
    const data = read();
    if (token && data.sessions[token]) {
      delete data.sessions[token];
      write(data);
    }
  }

  function accountForToken(token) {
    if (!token) return null;
    const data = read();
    const session = data.sessions[token];
    if (!session) return null;
    return data.accounts.find((account) => account.id === session.accountId) || null;
  }

  function saveAccount(account) {
    const data = read();
    const index = data.accounts.findIndex((item) => item.id === account.id);
    if (index < 0) return;
    data.accounts[index] = account;
    write(data);
  }

  return {
    signup,
    login,
    loginWithClover,
    logout,
    accountForToken,
    publicAccount,
    saveAccount,
  };
}

module.exports = { createAccountStore };
