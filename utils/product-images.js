const PRODUCT_IMAGE_PATH = '/assets/images/products/';
const DEFAULT_PRODUCT_IMAGE = PRODUCT_IMAGE_PATH + 'default.svg';

const CATEGORY_IMAGE_FILES = {
  'Indoor Plants': 'indoor-plants.svg',
  'Outdoor Plants': 'outdoor-plants.svg',
  'Plants': 'plants.svg',
  'Flower Plants': 'flower-plants.svg',
  'Herbs & Vegetables': 'herbs-vegetables.svg',
  'Seeds': 'seeds.svg',
  'Pots & Planters': 'pots-planters.svg',
  'Gardening Tools': 'gardening-tools.svg',
  'Fertilizers': 'fertilizers.svg',
  'Fertilizers / Manure': 'fertilizers.svg',
  'Manure': 'fertilizers.svg',
  'Soil / Potting Mix': 'soil-potting-mix.svg',
  'Soil': 'soil-potting-mix.svg',
  'Plant Accessories': 'plant-accessories.svg',
};

function defaultProductImage(category) {
  if (category && Object.prototype.hasOwnProperty.call(CATEGORY_IMAGE_FILES, category)) {
    return PRODUCT_IMAGE_PATH + CATEGORY_IMAGE_FILES[category];
  }
  return DEFAULT_PRODUCT_IMAGE;
}

function productImage(productOrItem) {
  const url = productOrItem && productOrItem.image_url;
  if (typeof url === 'string' && url.trim()) {
    return url.trim();
  }
  return defaultProductImage(productOrItem && productOrItem.category);
}

module.exports = {
  PRODUCT_IMAGE_PATH,
  DEFAULT_PRODUCT_IMAGE,
  CATEGORY_IMAGE_FILES,
  defaultProductImage,
  productImage,
};