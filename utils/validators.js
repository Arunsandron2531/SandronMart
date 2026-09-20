const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{6,15}$/;
const ROLES = ['BUYER', 'SELLER'];

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

module.exports = {
  validateLogin,
  validateRegister,
};