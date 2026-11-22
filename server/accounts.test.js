const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAccountStore } = require('./accounts');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kds-accounts-'));
  return createAccountStore(path.join(dir, 'accounts.json'));
}

test('a restaurant login only opens that restaurant', () => {
  const store = tempStore();
  store.signup({ email: 'apple@bar.com', password: 'kitchen-pass', restaurantName: 'Applemen' });
  store.signup({ email: 'other@bar.com', password: 'another-pass', restaurantName: 'Other Bar' });
  const apple = store.login({ email: 'apple@bar.com', password: 'kitchen-pass' });
  const other = store.login({ email: 'other@bar.com', password: 'another-pass' });
  assert.equal(store.accountForToken(apple.token).restaurantName, 'Applemen');
  assert.equal(store.accountForToken(other.token).restaurantName, 'Other Bar');
  assert.equal(apple.account.connected, false);
  assert.equal(store.accountForToken('missing'), null);
});

test('a Clover restaurant stays signed in', () => {
  const store = tempStore();
  const first = store.loginWithClover({
    merchantId: 'MERCHANT1',
    restaurantName: 'Applemen',
    environment: 'na',
    config: { accessToken: 'token-a', refreshToken: 'refresh-a' },
  });
  assert.equal(store.accountForToken(first.token).restaurantName, 'Applemen');
  assert.equal(store.accountForToken(first.token).config.accessToken, 'token-a');
  const again = store.loginWithClover({
    merchantId: 'MERCHANT1',
    restaurantName: 'Applemen Sports Bar',
    environment: 'na',
    config: { accessToken: 'token-b' },
  });
  assert.equal(store.accountForToken(again.token).restaurantName, 'Applemen Sports Bar');
  assert.equal(store.accountForToken(again.token).config.accessToken, 'token-b');
  assert.equal(store.accountForToken(first.token).restaurantName, 'Applemen Sports Bar');
});

test('a wrong password is rejected and the same email cannot register twice', () => {
  const store = tempStore();
  store.signup({ email: 'apple@bar.com', password: 'kitchen-pass', restaurantName: 'Applemen' });
  assert.throws(() => store.login({ email: 'apple@bar.com', password: 'nope' }), /wrong/);
  assert.throws(() => store.signup({ email: 'apple@bar.com', password: 'kitchen-pass', restaurantName: 'Again' }), /already uses/);
});
