const shop = require('../config/shop');

const formatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Format any amount as Indian Rupees with Indian digit grouping, e.g. 12,750 -> ₹12,750.00
function formatINR(amount) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  return `${shop.CURRENCY_SYMBOL}${formatter.format(safe)}`;
}

// Convenience for places that only need the numeric string without the symbol.
function formatINRNumber(amount) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  return formatter.format(safe);
}

module.exports = {
  formatINR,
  formatINRNumber,
};
