/* SANDRONMART - Client-side form validation (Vanilla JavaScript) */

(function (global) {
  'use strict';

  var PHONE_PATTERN = /^\+?[0-9]{6,15}$/;
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PASSWORD_MIN_LENGTH = 6;

  function setError(input, message) {
    input.classList.add('invalid');
    var errorSpan = document.getElementById(input.id + 'Error');
    if (errorSpan) {
      errorSpan.textContent = message;
    }
  }

  function clearError(input) {
    input.classList.remove('invalid');
    var errorSpan = document.getElementById(input.id + 'Error');
    if (errorSpan) {
      errorSpan.textContent = '';
    }
  }

  function validateField(input, tester, message) {
    if (!input.value || input.value.trim() === '') {
      setError(input, 'This field is required');
      return false;
    }
    if (!tester(input.value.trim())) {
      setError(input, message);
      return false;
    }
    clearError(input);
    return true;
  }

  /* ---------- Login ---------- */

  global.LoginValidation = {
    validate: function (scope) {
      var root = scope || document;
      var valid = true;
      var email = root.querySelector('input[name="email"]');
      var password = root.querySelector('input[name="password"]');

      if (!email || !password) {
        return true;
      }
      if (!email.value || email.value.trim() === '') {
        setError(email, 'Email is required');
        valid = false;
      } else if (!EMAIL_PATTERN.test(email.value.trim())) {
        setError(email, 'Please enter a valid email address');
        valid = false;
      } else {
        clearError(email);
      }

      if (!password.value) {
        setError(password, 'Password is required');
        valid = false;
      } else {
        clearError(password);
      }

      return valid;
    }
  };

  /* ---------- Register ---------- */

  global.RegisterValidation = {
    init: function () {
      var form = document.querySelector('form');
      if (!form) {
        return;
      }

      var fullName = document.getElementById('fullName');
      var email = document.getElementById('email');
      var phone = document.getElementById('phone');
      var password = document.getElementById('password');
      var confirm = document.getElementById('confirmPassword');

      var radioCards = document.querySelectorAll('.role-card');
      radioCards.forEach(function (card) {
        card.addEventListener('click', function () {
          var radio = card.querySelector('input');
          radio.checked = true;
          radioCards.forEach(function (c) {
            c.classList.remove('selected');
          });
          card.classList.add('selected');
        });
      });

      form.addEventListener('submit', function (e) {
        var valid = true;

        valid = validateField(fullName, function (v) {
          return v.length >= 3;
        }, 'Full name must be at least 3 characters') && valid;

        valid = validateField(email, function (v) {
          return EMAIL_PATTERN.test(v);
        }, 'Please enter a valid email address') && valid;

        valid = validateField(phone, function (v) {
          return PHONE_PATTERN.test(v);
        }, 'Please enter a valid phone number') && valid;

        if (!password.value) {
          setError(password, 'Password is required');
          valid = false;
        } else if (password.value.length < PASSWORD_MIN_LENGTH) {
          setError(password, 'Password must be at least ' + PASSWORD_MIN_LENGTH + ' characters');
          valid = false;
        } else {
          clearError(password);
        }

        if (!confirm.value) {
          setError(confirm, 'Please confirm your password');
          valid = false;
        } else if (confirm.value !== password.value) {
          setError(confirm, 'Passwords do not match');
          valid = false;
        } else {
          clearError(confirm);
        }

        if (!form.querySelector('input[name="role"]:checked')) {
          var alertBox = document.createElement('div');
          alertBox.className = 'alert alert-error';
          alertBox.textContent = 'Please select a role';
          form.insertBefore(alertBox, form.firstChild);
          valid = false;
        }

        if (!valid) {
          e.preventDefault();
        }
      });
    }
  };
/* ---------- Reviews ---------- */

  var REVIEW_MAX_LENGTH = 500;

  global.ReviewValidation = {
    init: function () {
      var forms = document.querySelectorAll('form.js-review-form');
      forms.forEach(function (form) {
        var ratingInputs = form.querySelectorAll('input[name="rating"]');
        var comment = form.querySelector('textarea[name="comment"]');
        if (!ratingInputs.length || !comment) {
          return;
        }

        var ratingError = form.querySelector('#reviewRatingError');
        var commentError = form.querySelector('#reviewCommentError');

        function selectedRating() {
          for (var i = 0; i < ratingInputs.length; i++) {
            if (ratingInputs[i].checked) {
              return ratingInputs[i].value;
            }
          }
          return null;
        }

        form.addEventListener('submit', function (e) {
          var valid = true;

          if (ratingError) {
            if (!selectedRating()) {
              ratingError.textContent = 'Please select a star rating';
              valid = false;
            } else {
              ratingError.textContent = '';
            }
          }

          if (commentError) {
            if (!comment.value || comment.value.trim() === '') {
              commentError.textContent = 'Please write a short review';
              valid = false;
            } else if (comment.value.trim().length > REVIEW_MAX_LENGTH) {
              commentError.textContent =
                'Review must be ' + REVIEW_MAX_LENGTH + ' characters or fewer';
              valid = false;
            } else {
              commentError.textContent = '';
            }
          }

          if (!valid) {
            e.preventDefault();
          }
        });
      });
    }
  };
})(window);