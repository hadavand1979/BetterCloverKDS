const test = require('node:test');
const assert = require('node:assert/strict');
const { describeNetworkError, rateLimitWaitMs } = require('./clover');

test('a Clover rate limit tells the kitchen to wait', () => {
  const error = new Error('429 Too Many Requests');
  error.status = 429;
  assert.equal(describeNetworkError(error), 'Clover asked this screen to wait. The tickets stay on the board.');
  assert.equal(rateLimitWaitMs('21'), 21_000);
  assert.equal(rateLimitWaitMs(''), 20_000);
  assert.equal(rateLimitWaitMs('120'), 60_000);
});
