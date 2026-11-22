const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareTicket, tallyLines, reconcileBumps, freezeClosedTimes, boardTickets, settingsForBoard, isInstructionModifier, orderRevision, applyKitchenStatus } = require('./tally');
const { createDemoOrders } = require('./demo');
const { normalizeOrder } = require('./clover');

test('a 10-item ticket tallies plates first and fries from every item', () => {
  const ticket = prepareTicket(createDemoOrders(1_700_000_000_000)[0], { includeModifiers: true });
  assert.equal(ticket.itemCount, 10);
  assert.deepEqual(
    ticket.tally.map((row) => [row.name, row.count]),
    [
      ['Burgers', 4],
      ['Chicken Fingers', 2],
      ['Steak and Cheese', 2],
      ['Steaks', 2],
      ['Fries', 10],
    ],
  );
  assert.equal(ticket.groups.length, 5);
  assert.equal(ticket.groups[0].qty, 1);
  assert.equal(ticket.groups[0].modifiers.some((mod) => mod.name === 'NO onion' && mod.instruction), true);
  assert.equal(ticket.groups[1].qty, 3);
  assert.equal(ticket.tally.some((row) => row.name === 'Medium'), false);
  assert.equal(ticket.tally.some((row) => /onion/i.test(row.name)), false);
});

test('prep instructions stay off the tally', () => {
  assert.equal(isInstructionModifier('NO onion'), true);
  assert.equal(isInstructionModifier('Medium'), true);
  assert.equal(isInstructionModifier('Fries'), false);
  const rows = tallyLines([
    { name: 'Burger', qty: 1, modifiers: [{ name: 'NO onion' }, { name: 'Fries' }] },
  ]);
  assert.deepEqual(rows.map((row) => row.name), ['Burger', 'Fries']);
});

test('Burger and Burgers count as one group', () => {
  const rows = tallyLines([
    { name: 'Burger', qty: 1, modifiers: [] },
    { name: 'Burgers', qty: 2, modifiers: [] },
  ]);
  assert.deepEqual(rows, [{ name: 'Burgers', count: 3 }]);
});

test('turning off sides leaves the plate counts', () => {
  const ticket = prepareTicket(createDemoOrders(0)[0], { includeModifiers: false });
  assert.deepEqual(
    ticket.tally.map((row) => row.name),
    ['Burgers', 'Chicken Fingers', 'Steak and Cheese', 'Steaks'],
  );
});

test('a saved Clover printer label does not hide the sample kitchen', () => {
  const orders = createDemoOrders(0);
  const board = boardTickets(orders, {}, settingsForBoard({ mode: 'demo', includeModifiers: true, printerLabels: ['KDS'] }));
  assert.deepEqual(board.active.map((ticket) => ticket.title), ['Table 12', 'Order 55', 'Pickup 18', 'Maya']);
  const grill = boardTickets(orders, {}, settingsForBoard({ mode: 'demo', includeModifiers: true, printerLabels: ['KDS', 'Grill'] }));
  assert.deepEqual(grill.active.map((ticket) => ticket.title), ['Table 12', 'Maya']);
});

test('a printer label keeps that station and a fry label counts only the sides', () => {
  const orders = createDemoOrders(0);
  const grill = prepareTicket(orders[0], { includeModifiers: true, printerLabels: ['Grill'] });
  assert.equal(grill.itemCount, 10);
  assert.deepEqual(
    grill.tally.map((row) => [row.name, row.count]),
    [
      ['Burgers', 4],
      ['Chicken Fingers', 2],
      ['Steak and Cheese', 2],
      ['Steaks', 2],
      ['Fries', 10],
    ],
  );
  const fry = prepareTicket(orders[0], { includeModifiers: true, printerLabels: ['Fry'] });
  assert.equal(fry.itemCount, 10);
  assert.deepEqual(fry.tally.map((row) => [row.name, row.count]), [['Fries', 10]]);
  const bar = prepareTicket(orders[2], { printerLabels: ['Bar'] });
  assert.deepEqual(bar.tally.map((row) => [row.name, row.count]), [['Sodas', 2]]);
  const hidden = boardTickets(orders, {}, { printerLabels: ['Cold'] });
  assert.deepEqual(hidden.active.map((ticket) => ticket.title), ['Pickup 18']);
});

test('a station filter keeps matching plates and their sides', () => {
  const ticket = prepareTicket(createDemoOrders(0)[0], {
    includeModifiers: true,
    stationFilter: 'steak',
  });
  assert.deepEqual(
    ticket.tally.map((row) => [row.name, row.count]),
    [
      ['Steak and Cheese', 2],
      ['Steaks', 2],
      ['Fries', 4],
    ],
  );
});

test('Clover payloads group line items and skip refunded or fee lines', () => {
  const order = normalizeOrder({
    id: 'ABC12345',
    state: 'open',
    title: '',
    createdTime: 100,
    modifiedTime: 100,
    lineItems: {
      elements: [
        {
          id: '1',
          name: 'Burger',
          refunded: false,
          item: { tags: { elements: [{ name: 'Grill' }] } },
          modifications: { elements: [{ name: 'Fries', modifier: { tags: { elements: [{ name: 'Fry' }] } } }] },
        },
        {
          id: '2',
          name: 'Burger',
          refunded: 'true',
          modifications: { elements: [{ name: 'Fries' }] },
        },
        { id: '3', name: 'Service Fee', isOrderFee: 'true' },
      ],
    },
    orderType: { label: 'To Go' },
    employee: { name: 'Sam' },
  });
  const ticket = prepareTicket(order, { includeModifiers: true });
  assert.equal(ticket.title, 'Order 2345');
  assert.equal(ticket.serverName, 'Sam');
  assert.equal(ticket.serviceTone, 'togo');
  assert.equal(ticket.itemCount, 1);
  assert.deepEqual(order.lines[0].labels, ['Grill']);
  assert.deepEqual(order.lines[0].modifiers[0].labels, ['Fry']);
  assert.deepEqual(
    ticket.tally.map((row) => [row.name, row.count]),
    [
      ['Burger', 1],
      ['Fries', 1],
    ],
  );
});

test('the clock starts when the kitchen items are added', () => {
  const order = normalizeOrder({
    id: 'TABLE201',
    state: 'open',
    title: '201 - Main Dining Room',
    createdTime: 1_000,
    modifiedTime: 50_000,
    lineItems: {
      elements: [
        { id: 'drink', name: 'Soda', createdTime: 1_000, item: { tags: { elements: [{ name: 'Bar' }] } } },
        { id: 'food', name: 'Wings', createdTime: 48_000, item: { tags: { elements: [{ name: 'KDS' }] } } },
      ],
    },
  });
  const ticket = prepareTicket(order, { printerLabels: ['KDS'], includeModifiers: true });
  assert.equal(ticket.createdTime, 48_000);
  assert.equal(ticket.itemCount, 1);
  const board = boardTickets([order], {}, { printerLabels: ['KDS'] });
  assert.equal(board.active[0].createdTime, 48_000);
});

test('marking one item done leaves the ticket open and crosses that item off', () => {
  const order = {
    id: 'table',
    state: 'open',
    title: '201',
    createdTime: 1_000,
    lines: [
      { id: 'wings', name: 'Wings', qty: 1, modifiers: [] },
      { id: 'steak', name: 'Sirloin', qty: 1, modifiers: [] },
    ],
  };
  const marked = boardTickets([order], { table: { done: { wings: 5_000 } } }, {});
  assert.equal(marked.active.length, 1);
  assert.equal(marked.active[0].lines.find((line) => line.id === 'wings').done, true);
  assert.equal(marked.active[0].lines.find((line) => line.id === 'steak').done, false);
  const changed = reconcileBumps(
    [{ ...order, lines: [order.lines[1]] }],
    { table: { status: 'bumped', at: 9, revision: 'old', done: { wings: 5_000, steak: 6_000 } } },
  );
  assert.deepEqual(changed.bumps.table, { done: { steak: 6_000 } });
});

test('a bumped ticket stays completed until its items change', () => {
  const order = {
    id: 'a',
    modifiedTime: 9000,
    lines: [{ id: '1', name: 'Burger', qty: 1, modifiers: [] }],
  };
  const revision = orderRevision(order);
  const same = reconcileBumps([order], { a: { status: 'bumped', at: 1000, revision } });
  assert.equal(same.changed, false);
  assert.equal(same.bumps.a.status, 'bumped');
  const changedOrder = { ...order, lines: [...order.lines, { id: '2', name: 'Fries', qty: 1, modifiers: [] }] };
  const next = reconcileBumps([changedOrder], { a: { status: 'bumped', at: 1000, revision } });
  assert.equal(next.changed, true);
  assert.deepEqual(next.bumps, {});
});

test('a ticket leaves the open board once every kitchen item is ready', () => {
  const order = {
    id: 'k',
    state: 'open',
    title: 'Table 8',
    createdTime: 5,
    lines: [
      { id: 'a', name: 'Burger', qty: 1, modifiers: [] },
      { id: 'b', name: 'Fries', qty: 1, modifiers: [] },
    ],
  };
  const events = [
    { orderId: 'k', lineItemId: 'a', type: 'com.clover.kds.REQUESTED', createdTime: 1 },
    { orderId: 'k', lineItemId: 'b', type: 'com.clover.kds.REQUESTED', createdTime: 1 },
    { orderId: 'k', lineItemId: 'a', type: 'com.clover.kds.READY', createdTime: 2 },
  ];
  const working = boardTickets(applyKitchenStatus([order], events), {}, {});
  assert.deepEqual(working.active.map((ticket) => ticket.id), ['k']);
  const doneEvents = events.concat({ orderId: 'k', lineItemId: 'b', type: 'com.clover.kds.READY', createdTime: 3 });
  const done = boardTickets(applyKitchenStatus([order], doneEvents), {}, {});
  assert.equal(done.active.length, 0);
  assert.equal(done.closed[0].kitchenDone, true);
  const recalled = boardTickets(applyKitchenStatus([order], doneEvents), { k: { status: 'reopened', at: 4 } }, {});
  assert.deepEqual(recalled.active.map((ticket) => ticket.id), ['k']);
});

test('drinks still requested on the check do not keep a finished station ticket open', () => {
  const order = {
    id: 'table',
    state: 'open',
    title: '12 - Main Bar',
    createdTime: 5,
    lines: [
      { id: 'food', name: 'Steak and Cheese Sub', qty: 1, modifiers: [], labels: ['KDS'] },
      { id: 'side', name: 'Macaroni Salad', qty: 1, modifiers: [], labels: ['KDS'] },
      { id: 'drink', name: 'Ketel One', qty: 1, modifiers: [], labels: ['Bar'] },
    ],
  };
  const events = [
    { orderId: 'table', lineItemId: 'food', type: 'com.clover.kds.READY', createdTime: 2 },
    { orderId: 'table', lineItemId: 'side', type: 'com.clover.kds.READY', createdTime: 2 },
    { orderId: 'table', lineItemId: 'drink', type: 'com.clover.kds.REQUESTED', createdTime: 3 },
  ];
  const settings = { printerLabels: ['KDS'] };
  const board = boardTickets(applyKitchenStatus([order], events, settings), {}, settings);
  assert.equal(board.active.length, 0);
  assert.equal(board.closed[0].kitchenDone, true);
});

test('a closed ticket keeps the time it took to finish', () => {
  const order = {
    id: 'c',
    state: 'locked',
    title: 'Table 5',
    createdTime: 1000,
    modifiedTime: 61000,
    lines: [{ name: 'Burger', qty: 1, modifiers: [] }],
  };
  assert.equal(boardTickets([order], {}, {}).closed[0].closedAt, 61000);
  const frozen = freezeClosedTimes([order], {}, {}, 999000);
  assert.equal(frozen.bumps.c.closedAt, 61000);
  const moved = { ...order, modifiedTime: 200000 };
  assert.equal(boardTickets([moved], frozen.bumps, {}).closed[0].closedAt, 61000);
});

test('hidden Clover orders are left off the board', () => {
  assert.equal(normalizeOrder({ id: 'x', state: null, lineItems: { elements: [{ name: 'Burger' }] } }), null);
  const locked = normalizeOrder({ id: 'z', state: 'locked', title: 'Table 9', lineItems: { elements: [{ name: 'Burger' }] } });
  assert.equal(locked.state, 'locked');
});

test('closed orders stay off the open board until they are made active', () => {
  const open = {
    id: 'o',
    state: 'open',
    title: 'Table 1',
    createdTime: 1,
    modifiedTime: 1,
    lines: [{ name: 'Steak', qty: 1, modifiers: [] }],
  };
  const locked = {
    id: 'c',
    state: 'locked',
    title: 'Table 9',
    createdTime: 2,
    modifiedTime: 2,
    lines: [{ name: 'Fries', qty: 2, modifiers: [] }],
  };
  const first = boardTickets([open, locked], {}, { stationFilter: 'steak' });
  assert.deepEqual(first.active.map((ticket) => ticket.id), ['o']);
  assert.deepEqual(first.closed.map((ticket) => ticket.id), ['c']);
  assert.equal(first.closed[0].lines.length, 1);

  const reopened = boardTickets([open, locked], { c: { status: 'reopened', at: 3 } }, {});
  assert.deepEqual(reopened.active.map((ticket) => ticket.id), ['o', 'c']);
  assert.equal(reopened.closed.length, 0);

  const held = boardTickets([locked], { c: { status: 'held', at: 4, reopened: true } });
  assert.equal(held.active[0].held, true);
  assert.equal(held.closed.length, 0);

  const bumped = boardTickets([open], { o: { status: 'bumped', at: 9 } });
  assert.equal(bumped.active.length, 0);
  assert.equal(bumped.closed[0].bumped, true);
});
