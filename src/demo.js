const ITEM_LABELS = {
  Burger: ['Grill'],
  'Chicken Fingers': ['Grill'],
  'Steak and Cheese': ['Grill'],
  Steak: ['Grill'],
  'California Burrito': ['Grill'],
  Wings: ['Fry'],
  'Garden Salad': ['Cold'],
  Soup: ['Cold'],
  Horchata: ['Bar'],
  Soda: ['Bar'],
};

const MOD_LABELS = {
  Fries: ['Fry'],
  'Extra Ranch': ['Fry'],
};

function line(id, name, mods = [], extra = {}) {
  return {
    id,
    name,
    qty: extra.qty || 1,
    note: extra.note || '',
    labels: extra.labels || ITEM_LABELS[name] || [],
    modifiers: mods.map((modName) => ({ name: modName, labels: MOD_LABELS[modName] || [] })),
    refunded: false,
    hidden: false,
    fee: false,
    exchanged: false,
    unitName: extra.unitName || '',
    unitQty: extra.unitQty || null,
  };
}

function createDemoOrders(now) {
  const minute = 60 * 1000;
  return [
    {
      id: 'demo-table-12',
      title: 'Table 12',
      orderType: 'Here',
      serverName: 'Alex',
      note: 'Window seat',
      createdTime: now - 12 * minute,
      modifiedTime: now - 12 * minute,
      paymentState: 'OPEN',
      lines: [
        line('b1', 'Burger', ['NO onion', 'Fries']),
        line('b2', 'Burger', ['Fries']),
        line('b3', 'Burger', ['Fries']),
        line('b4', 'Burger', ['Fries']),
        line('c1', 'Chicken Fingers', ['Fries']),
        line('c2', 'Chicken Fingers', ['Fries']),
        line('sc1', 'Steak and Cheese', ['Fries']),
        line('sc2', 'Steak and Cheese', ['Fries']),
        line('st1', 'Steak', ['Medium', 'Fries']),
        line('st2', 'Steak', ['Medium', 'Fries']),
      ],
    },
    {
      id: 'demo-maya',
      title: 'Maya',
      orderType: 'To Go',
      serverName: 'Jordan',
      note: '',
      createdTime: now - 40 * 1000,
      modifiedTime: now - 40 * 1000,
      paymentState: 'OPEN',
      lines: [
        line('m1', 'California Burrito', ['NO sour cream', 'Fries']),
        line('m2', 'Horchata'),
      ],
    },
    {
      id: 'demo-55',
      title: 'Order 55',
      orderType: 'Delivery',
      serverName: 'Sam',
      note: 'Leave at the door',
      createdTime: now - 8 * minute,
      modifiedTime: now - 8 * minute,
      paymentState: 'PAID',
      lines: [
        line('d1', 'Wings', ['Extra Ranch'], { qty: 3 }),
        line('d2', 'Soda', [], { qty: 2 }),
      ],
    },
    {
      id: 'demo-18',
      title: 'Pickup 18',
      orderType: 'Pickup',
      serverName: 'Riley',
      note: '',
      createdTime: now - 6 * minute,
      modifiedTime: now - 6 * minute,
      paymentState: 'PAID',
      lines: [
        line('p1', 'Garden Salad', ['NO dressing']),
        line('p2', 'Soup'),
      ],
    },
    {
      id: 'demo-table-9',
      title: 'Table 9',
      orderType: 'Here',
      serverName: 'Alex',
      note: '',
      state: 'locked',
      createdTime: now - 40 * minute,
      modifiedTime: now - 30 * minute,
      paymentState: 'PAID',
      lines: [
        line('x1', 'Burger', ['Fries']),
        line('x2', 'Burger', ['Fries']),
      ],
    },
  ];
}

module.exports = { createDemoOrders, DEMO_LABELS: ['Grill', 'Fry', 'Cold', 'Bar'] };
