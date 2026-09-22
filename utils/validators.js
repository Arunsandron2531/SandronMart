const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{6,15}$/;
const INDIAN_MOBILE_PATTERN = /^[6-9][0-9]{9}$/;
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;
const ROLES = ['BUYER', 'SELLER'];

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const PRODUCT_CATEGORIES = [
  'Indoor Plants',
  'Outdoor Plants',
  'Seeds',
  'Pots & Planters',
  'Gardening Tools',
  'Fertilizers',
  'Herbs & Vegetables',
];

function addError(errors, field, message) {
  if (!errors[field]) {
    errors[field] = [];
  }
  errors[field].push(message);
}

function validateEmail(email) {
  return typeof email === 'string' && EMAIL_PATTERN.test(email.trim());
}

function validateLogin(email, password) {
  const errors = {};
  if (!email || !email.trim()) {
    addError(errors, 'email', 'Email is required');
  } else if (!validateEmail(email)) {
    addError(errors, 'email', 'Please enter a valid email address');
  }

  if (!password) {
    addError(errors, 'password', 'Password is required');
  }
  return errors;
}

function validateRegister(body) {
  const errors = {};
  const { fullName, email, phone, password, confirmPassword, role } = body;

  if (!fullName || !fullName.trim()) {
    addError(errors, 'fullName', 'Full name is required');
  } else if (fullName.trim().length < 3) {
    addError(errors, 'fullName', 'Full name must be at least 3 characters');
  }

  if (!email || !email.trim()) {
    addError(errors, 'email', 'Email is required');
  } else if (!validateEmail(email)) {
    addError(errors, 'email', 'Please enter a valid email address');
  }

  if (!phone || !phone.trim()) {
    addError(errors, 'phone', 'Phone number is required');
  } else if (!PHONE_PATTERN.test(phone.trim())) {
    addError(errors, 'phone', 'Please enter a valid phone number');
  }

  if (!password) {
    addError(errors, 'password', 'Password is required');
  } else if (password.length < 6) {
    addError(errors, 'password', 'Password must be at least 6 characters');
  }

  if (!confirmPassword) {
    addError(errors, 'confirmPassword', 'Please confirm your password');
  } else if (password && password !== confirmPassword) {
    addError(errors, 'confirmPassword', 'Passwords do not match');
  }

  if (!ROLES.includes(role)) {
    addError(errors, 'role', "Role must be Buyer or Seller");
  }

  return errors;
}

function validateAdminSetup(body) {
  const errors = {};
  const { fullName, email, phone, password, confirmPassword } = body;

  if (!fullName || !fullName.trim()) {
    addError(errors, 'fullName', 'Full name is required');
  } else if (fullName.trim().length < 3) {
    addError(errors, 'fullName', 'Full name must be at least 3 characters');
  }

  if (!email || !email.trim()) {
    addError(errors, 'email', 'Email is required');
  } else if (!validateEmail(email)) {
    addError(errors, 'email', 'Please enter a valid email address');
  }

  if (!phone || !phone.trim()) {
    addError(errors, 'phone', 'Phone number is required');
  } else if (!PHONE_PATTERN.test(phone.trim())) {
    addError(errors, 'phone', 'Please enter a valid phone number');
  }

  if (!password) {
    addError(errors, 'password', 'Password is required');
  } else if (password.length < 6) {
    addError(errors, 'password', 'Password must be at least 6 characters');
  }

  if (!confirmPassword) {
    addError(errors, 'confirmPassword', 'Please confirm your password');
  } else if (password && password !== confirmPassword) {
    addError(errors, 'confirmPassword', 'Passwords do not match');
  }

  return errors;
}

function validateIndianMobile(phone) {
  return typeof phone === 'string' && INDIAN_MOBILE_PATTERN.test(phone.trim());
}

function validatePincode(pincode) {
  return typeof pincode === 'string' && PINCODE_PATTERN.test(pincode.trim());
}

function single(value) {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

function validateAddress(body) {
  const errors = {};
  const fullName = single(body.full_name).trim();
  const phone = single(body.phone).trim();
  const houseNumber = single(body.house_number).trim();
  const street = single(body.street).trim();
  const landmark = single(body.landmark).trim();
  const city = single(body.city).trim();
  const district = single(body.district).trim();
  const state = single(body.state).trim();
  const pincode = single(body.pincode).trim();

  if (!fullName) {
    addError(errors, 'full_name', 'Full name is required');
  }

  if (!phone) {
    addError(errors, 'phone', 'Mobile number is required');
  } else if (!validateIndianMobile(phone)) {
    addError(errors, 'phone', 'Enter a valid 10-digit Indian mobile number');
  }

  if (!houseNumber) {
    addError(errors, 'house_number', 'House / Flat / Door number is required');
  }

  if (!street) {
    addError(errors, 'street', 'Street / Area is required');
  }

  if (!city) {
    addError(errors, 'city', 'City / Town is required');
  }

  if (!state) {
    addError(errors, 'state', 'State is required');
  } else if (!INDIA_STATES.includes(state)) {
    addError(errors, 'state', 'Please select a valid Indian state');
  }

  if (!pincode) {
    addError(errors, 'pincode', 'Pincode is required');
  } else if (!validatePincode(pincode)) {
    addError(errors, 'pincode', 'Enter a valid 6-digit Indian pincode');
  }

  errors.__clean = {
    full_name: fullName,
    phone: phone,
    house_number: houseNumber,
    street: street,
    landmark: landmark,
    city: city,
    district: district,
    state: state,
    pincode: pincode,
  };

  return errors;
}

function validateProduct(body) {
  const errors = {};
  const { name, description, category, price, stock } = body;

  if (!name || !name.trim()) {
    addError(errors, 'name', 'Product name is required');
  }

  if (!description || !description.trim()) {
    addError(errors, 'description', 'Description is required');
  }

  if (!category || !PRODUCT_CATEGORIES.includes(category.trim())) {
    addError(errors, 'category', 'Please select a valid category');
  }

  if (price === undefined || price === null || String(price).trim() === '') {
    addError(errors, 'price', 'Price is required');
  } else {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      addError(errors, 'price', 'Price must be greater than 0');
    }
  }

  if (stock === undefined || stock === null || String(stock).trim() === '') {
    addError(errors, 'stock', 'Stock quantity is required');
  } else if (!/^\d+$/.test(String(stock).trim())) {
    addError(errors, 'stock', 'Stock must be a whole number');
  } else if (Number(stock) < 0) {
    addError(errors, 'stock', 'Stock must be 0 or greater');
  }

  return errors;
}

module.exports = {
  validateLogin,
  validateRegister,
  validateAdminSetup,
  validateProduct,
  validateAddress,
  validateIndianMobile,
  validatePincode,
  PRODUCT_CATEGORIES,
  INDIA_STATES,
};