const PRODUCT_IMAGE_PATH = '/assets/images/products/';
const DEFAULT_PRODUCT_IMAGE = PRODUCT_IMAGE_PATH + 'default.jpg';

// Ordered keyword rules: the first rule whose keyword appears in the product name
// wins, so we match the SPECIFIC product before anything generic
// (e.g. "Rose Seeds" -> rose-seeds.jpg, not the rose photo).
const KEYWORD_RULES = [
  { keys: ['rose seeds', 'rose seed'], img: 'rose-seeds.jpg' },
  { keys: ['curry leaves', 'curry leaf', 'meetha neem', 'kadi patta', 'kari patta'], img: 'curry.jpg' },
  { keys: ['neem'], img: 'neem.jpg' },
  { keys: ['tulsi', 'holy basil'], img: 'tulsi.jpg' },
  { keys: ['aloe'], img: 'aloe-vera.jpg' },
  { keys: ['snake plant', 'sansevieria', 'mother in law'], img: 'snake-plant.jpg' },
  { keys: ['money plant', 'pothos', 'money'], img: 'money-plant.jpg' },
  { keys: ['monstera'], img: 'monstera.jpg' },
  { keys: ['lavender', 'lavandula'], img: 'lavender.jpg' },
  { keys: ['succulent'], img: 'succulent-mix.jpg' },
  { keys: ['pea'], img: 'pea-seeds.jpg' },
  { keys: ['sunflower'], img: 'sunflower-seeds.jpg' },
  { keys: ['coriander', 'cilantro', 'dhaniya'], img: 'coriander.jpg' },
  { keys: ['seed'], img: 'pea-seeds.jpg' },
  { keys: ['rose'], img: 'rose.jpg' },
  { keys: ['banana', 'kela'], img: 'banana.jpg' },
  { keys: ['mango', 'aam'], img: 'mango.jpg' },
  { keys: ['guava', 'amrud'], img: 'guava.jpg' },
  { keys: ['papaya', 'papita'], img: 'papaya.jpg' },
  { keys: ['lemon', 'nimbu'], img: 'lemon.jpg' },
  { keys: ['coconut', 'kera'], img: 'coconut.jpg' },
  { keys: ['orange', 'santra', 'narangi'], img: 'orange.jpg' },
  { keys: ['chilli', 'chili', 'capsicum', 'mirchi'], img: 'chilli.jpg' },
  { keys: ['tomato'], img: 'tomato.jpg' },
  { keys: ['basil'], img: 'basil.jpg' },
  { keys: ['mint', 'pudina'], img: 'mint.jpg' },
  { keys: ['curry'], img: 'curry.jpg' },
  { keys: ['hibiscus', 'gudhal'], img: 'hibiscus.jpg' },
  { keys: ['marigold', 'genda'], img: 'marigold.jpg' },
  { keys: ['jasmine', 'mogra', 'juhi'], img: 'jasmine.jpg' },
  { keys: ['fern'], img: 'fern.jpg' },
  { keys: ['compost'], img: 'compost.jpg' },
  { keys: ['manure'], img: 'compost.jpg' },
  { keys: ['fertiliz'], img: 'liquid-fertilizer.jpg' },
  { keys: ['hanging basket'], img: 'hanging-basket.jpg' },
  { keys: ['basket'], img: 'hanging-basket.jpg' },
  { keys: ['terracotta'], img: 'plant-pot.jpg' },
  { keys: ['pot'], img: 'plant-pot.jpg' },
  { keys: ['planter'], img: 'plant-pot.jpg' },
  { keys: ['trowel'], img: 'garden-trowel.jpg' },
  { keys: ['watering'], img: 'watering-can.jpg' },
];

// Category fallback: only used when the product name itself gives no clue.
// Each category still maps to a REAL photo of a typical product in that range,
// so we never fall straight to one generic image.
const CATEGORY_IMAGE_MAP = {
  'Indoor Plants': 'snake-plant.jpg',
  'Outdoor Plants': 'garden.jpg',
  'Flower Plants': 'garden.jpg',
  'Plants': 'monstera.jpg',
  'Seeds': 'pea-seeds.jpg',
  'Pots & Planters': 'plant-pot.jpg',
  'Gardening Tools': 'garden-trowel.jpg',
  'Fertilizers': 'compost.jpg',
  'Fertilizers / Manure': 'compost.jpg',
  'Manure': 'compost.jpg',
  'Soil / Potting Mix': 'soil.jpg',
  'Soil': 'soil.jpg',
  'Plant Accessories': 'hanging-basket.jpg',
  'Herbs & Vegetables': 'basil.jpg',
};

function nameMatch(name) {
  const n = String(name || '').toLowerCase();
  if (!n) {
    return null;
  }
  for (const rule of KEYWORD_RULES) {
    for (const key of rule.keys) {
      if (n.includes(key)) {
        return rule.img;
      }
    }
  }
  return null;
}

function defaultProductImage(product) {
  const isPlainString = typeof product === 'string';
  const name = isPlainString ? null : (product && product.name);
  const category = isPlainString ? product : (product && product.category);

  const byName = nameMatch(name);
  if (byName) {
    return PRODUCT_IMAGE_PATH + byName;
  }

  if (category && Object.prototype.hasOwnProperty.call(CATEGORY_IMAGE_MAP, category)) {
    return PRODUCT_IMAGE_PATH + CATEGORY_IMAGE_MAP[category];
  }

  return DEFAULT_PRODUCT_IMAGE;
}

function productImage(productOrItem) {
  const url = productOrItem && productOrItem.image_url;
  if (typeof url === 'string' && url.trim()) {
    return url.trim();
  }
  return defaultProductImage(productOrItem);
}

module.exports = {
  PRODUCT_IMAGE_PATH,
  DEFAULT_PRODUCT_IMAGE,
  KEYWORD_RULES,
  CATEGORY_IMAGE_MAP,
  defaultProductImage,
  productImage,
};