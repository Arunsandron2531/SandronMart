// SANDRONMART - single source of truth for currency and delivery settings.

module.exports = {
  CURRENCY: 'INR',
  CURRENCY_SYMBOL: '\u20B9',

  // Delivery charge applied to every order below the free-delivery threshold.
  DELIVERY_CHARGE: 40,
  // Orders with a subtotal at or above this amount get FREE delivery.
  FREE_DELIVERY_THRESHOLD: 799,

  // Delivery window (in days from the order date).
  DELIVERY_MIN_DAYS: 3,
  DELIVERY_MAX_DAYS: 7,

  TIME_SLOTS: [
    '9:00 AM - 12:00 PM',
    '12:00 PM - 3:00 PM',
    '3:00 PM - 6:00 PM',
    '6:00 PM - 9:00 PM',
  ],

  PAYMENT_METHODS: [
    { code: 'COD', label: 'Cash on Delivery', description: 'Pay in cash when your order arrives.' },
    { code: 'UPI', label: 'UPI', description: 'Pay instantly using Google Pay, PhonePe, Paytm and more.' },
    { code: 'CARD', label: 'Credit / Debit Card', description: 'Visa, Mastercard, RuPay and more.' },
  ],

  ORDER_STATUSES: [
    'PLACED',
    'CONFIRMED',
    'PACKED',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
  ],
};
