const shop = require('../config/shop');

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_FLOW = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'];

const STATUS_LABELS = {
  PENDING: 'Pending',
  CONFIRMED: 'Order Confirmed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const NEXT_STATUS = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'SHIPPED',
  SHIPPED: 'DELIVERED',
};

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseISODate(iso) {
  return new Date(`${iso}T00:00:00`);
}

// Returns { start, end } ISO dates for an expected delivery window.
function computeDeliveryWindow(fromDate) {
  const base = fromDate ? new Date(fromDate.getTime()) : new Date();
  return {
    start: toISODate(addDays(base, shop.DELIVERY_MIN_DAYS)),
    end: toISODate(addDays(base, shop.DELIVERY_MAX_DAYS)),
  };
}

function formatDayMonth(iso) {
  if (!iso) return '';
  const date = parseISODate(iso);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

function formatDateRange(startIso, endIso) {
  if (!startIso) return '';
  if (!endIso || startIso === endIso) return formatDayMonth(startIso);
  return `${formatDayMonth(startIso)} \u2013 ${formatDayMonth(endIso)}`;
}

function formatLongDate(iso) {
  if (!iso) return '';
  const date = parseISODate(iso);
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

// SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC.
function formatDateTime(value) {
  if (!value) return '';
  const normalised = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(`${normalised}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}, ${hour12}:${minutes} ${suffix}`;
}

function formatOrderDate(value) {
  if (!value) return '';
  const normalised = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(`${normalised}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function nextStatus(status) {
  return NEXT_STATUS[status] || null;
}

// Build the tracking timeline for an order. Reached statuses show their real
// timestamp (from order_status_events); upcoming statuses show expected dates.
function buildTimeline(order, events) {
  const byStatus = {};
  (events || []).forEach((event) => {
    if (!byStatus[event.status]) {
      byStatus[event.status] = event;
    }
  });

  if (order.status === 'CANCELLED') {
    const pending = byStatus.PENDING;
    const cancelled = byStatus.CANCELLED;
    return [
      {
        status: 'PENDING',
        label: statusLabel('PENDING'),
        reached: true,
        at: pending ? formatDateTime(pending.created_at) : formatDateTime(order.created_at),
      },
      {
        status: 'CANCELLED',
        label: statusLabel('CANCELLED'),
        reached: true,
        at: cancelled ? formatDateTime(cancelled.created_at) : formatDateTime(order.updated_at),
      },
    ];
  }

  const currentIndex = STATUS_FLOW.indexOf(order.status);

  return STATUS_FLOW.map((status, index) => {
    const reached = index <= currentIndex;
    if (reached) {
      const event = byStatus[status];
      return {
        status,
        label: statusLabel(status),
        reached: true,
        at: event ? formatDateTime(event.created_at) : formatDateTime(order.created_at),
      };
    }
    return {
      status,
      label: statusLabel(status),
      reached: false,
      expected: expectedLabel(status, order),
    };
  });
}

function expectedLabel(status, order) {
  switch (status) {
    case 'CONFIRMED':
      return `Expected: ${formatOrderDate(order.created_at)}`;
    case 'SHIPPED':
      return `Expected: ${formatDayMonth(order.delivery_start_date)}`;
    case 'DELIVERED':
      return `Expected: ${formatDateRange(order.delivery_start_date, order.delivery_end_date)}`;
    default:
      return '';
  }
}

module.exports = {
  STATUS_FLOW,
  STATUS_LABELS,
  NEXT_STATUS,
  toISODate,
  addDays,
  parseISODate,
  computeDeliveryWindow,
  formatDayMonth,
  formatDateRange,
  formatLongDate,
  formatDateTime,
  formatOrderDate,
  statusLabel,
  nextStatus,
  buildTimeline,
};
