/* SANDRONMART - Checkout form validation and interactions (Vanilla JavaScript) */

(function () {
  'use strict';

  var INDIA_MOBILE = /^[6-9][0-9]{9}$/;
  var PINCODE = /^[1-9][0-9]{5}$/;

  var form = document.getElementById('checkout-form');
  if (!form) {
    return;
  }

  var newFields = document.getElementById('new-address-fields');
  var paymentNote = document.getElementById('payment-note');

  function fieldError(name, message) {
    var input = form.querySelector('[name="' + name + '"]');
    if (!input) {
      return;
    }
    input.classList.add('invalid');
    var parent = input.closest('.field');
    if (!parent) {
      return;
    }
    var existing = parent.querySelector('.field-error');
    if (!existing) {
      existing = document.createElement('span');
      existing.className = 'field-error';
      parent.appendChild(existing);
    }
    existing.textContent = message;
  }

  function clearFieldError(name) {
    var input = form.querySelector('[name="' + name + '"]');
    if (!input) {
      return;
    }
    input.classList.remove('invalid');
    var parent = input.closest('.field');
    if (!parent) {
      return;
    }
    var existing = parent.querySelector('.field-error');
    if (existing) {
      existing.textContent = '';
    }
  }

  function currentAddressSelection() {
    var selected = form.querySelector('input[name="address_id"][type="radio"]:checked');
    if (!selected) {
      return null;
    }
    return selected.value;
  }

  function toggleNewAddress() {
    if (!newFields) {
      return;
    }
    var showFields = true;
    var selected = form.querySelector('input[name="address_id"][type="radio"]:checked');
    var hasSaved = form.querySelectorAll('input[name="address_id"][type="radio"][value]:not([value="new"])').length > 0;
    if (selected && hasSaved) {
      showFields = selected.value === 'new';
    }
    newFields.hidden = !showFields;
  }

  var addressRadios = form.querySelectorAll('input[name="address_id"][type="radio"]');
  var hiddenNewAddress = form.querySelector('input[name="address_id"][type="hidden"]');
  addressRadios.forEach(function (radio) {
    radio.addEventListener('change', toggleNewAddress);
  });

  function normalizeDigits(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
  }

  var phoneInput = form.querySelector('#phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      normalizeDigits(phoneInput);
    });
  }

  var pincodeInput = form.querySelector('#pincode');
  if (pincodeInput) {
    pincodeInput.addEventListener('input', function () {
      normalizeDigits(pincodeInput);
    });
  }

  function showPaymentNote() {
    var selected = form.querySelector('input[name="payment_method"]:checked');
    if (!paymentNote || !selected) {
      return;
    }
    var value = selected.value;
    if (value === 'UPI') {
      paymentNote.textContent = 'UPI Payment: You will be redirected to your UPI app after placing the order (simulated).';
      paymentNote.hidden = false;
    } else if (value === 'CARD') {
      paymentNote.textContent = 'Card Payment: Card details will be requested in the next step (simulated).';
      paymentNote.hidden = false;
    } else {
      paymentNote.hidden = true;
    }
  }

  var paymentRadios = form.querySelectorAll('input[name="payment_method"]');
  paymentRadios.forEach(function (radio) {
    radio.addEventListener('change', showPaymentNote);
  });

  function validate() {
    var valid = true;

    form.querySelectorAll('.field-error').forEach(function (el) {
      el.textContent = '';
    });
    form.querySelectorAll('.invalid').forEach(function (el) {
      el.classList.remove('invalid');
    });

    var usingNew = !!hiddenNewAddress || currentAddressSelection() === 'new';

    if (usingNew) {
      var checks = [
        ['full_name', function (v) { return v.trim().length > 0; }, 'Full name is required'],
        ['phone', function (v) { return INDIA_MOBILE.test(v); }, 'Enter a valid 10-digit Indian mobile number'],
        ['house_number', function (v) { return v.trim().length > 0; }, 'House / Flat / Door number is required'],
        ['street', function (v) { return v.trim().length > 0; }, 'Street / Area is required'],
        ['city', function (v) { return v.trim().length > 0; }, 'City / Town is required'],
        ['state', function (v) { return v.trim().length > 0; }, 'State is required'],
        ['pincode', function (v) { return PINCODE.test(v); }, 'Enter a valid 6-digit Indian pincode'],
      ];
      checks.forEach(function (check) {
        var input = form.querySelector('[name="' + check[0] + '"]');
        if (!input) {
          return;
        }
        if (!check[1](input.value)) {
          fieldError(check[0], check[2]);
          valid = false;
        } else {
          clearFieldError(check[0]);
        }
      });
    }

    if (addressRadios.length && !form.querySelector('input[name="address_id"][type="radio"]:checked')) {
      valid = false;
      var addressList = document.querySelector('.address-list');
      if (addressList) {
        addressList.classList.add('invalid');
      }
    }

    if (!form.querySelector('input[name="delivery_time_slot"]:checked')) {
      var slotList = document.querySelector('.slot-list');
      if (slotList) {
        slotList.classList.add('invalid');
      }
      valid = false;
    }

    if (!form.querySelector('input[name="payment_method"]:checked')) {
      var paymentList = document.querySelector('.payment-list');
      if (paymentList) {
        paymentList.classList.add('invalid');
      }
      valid = false;
    }

    if (hiddenNewAddress && hiddenNewAddress.value !== 'new') {
      hiddenNewAddress.value = 'new';
    }

    return valid;
  }

  form.addEventListener('submit', function (event) {
    var slotSelected = form.querySelector('input[name="delivery_time_slot"]:checked');
    if (!slotSelected) {
      slotSelected = form.querySelector('input[name="delivery_time_slot"]');
    }
    var paymentSelected = form.querySelector('input[name="payment_method"]:checked');
    if (!paymentSelected) {
      paymentSelected = form.querySelector('input[name="payment_method"]');
    }

    if (!validate()) {
      event.preventDefault();
      var alertBox = document.getElementById('checkout-error-box');
      if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.className = 'alert alert-error';
        alertBox.id = 'checkout-error-box';
        form.insertBefore(alertBox, form.firstChild);
      }
      alertBox.textContent = 'Please complete all required fields before placing your order.';
    }
  });

  toggleNewAddress();
  showPaymentNote();
})();