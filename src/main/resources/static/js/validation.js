/* SANDRONMART - Client-side form validation (Vanilla JavaScript) */

(function (global) {
    "use strict";

    var PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
    var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function setError(input, message) {
        input.classList.add("invalid");
        var errorSpan = document.getElementById(input.id + "Error");
        if (errorSpan) {
            errorSpan.textContent = message;
        }
    }

    function clearError(input) {
        input.classList.remove("invalid");
        var errorSpan = document.getElementById(input.id + "Error");
        if (errorSpan) {
            errorSpan.textContent = "";
        }
    }

    function validateField(input, tester, message) {
        if (!input.value || input.value.trim() === "") {
            setError(input, "This field is required");
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
        validate: function () {
            var valid = true;
            var email = document.getElementById("email");
            var password = document.getElementById("password");

            if (!email || !password) {
                return true;
            }
            if (!email.value || email.value.trim() === "") {
                setError(email, "Email is required");
                valid = false;
            } else if (!EMAIL_PATTERN.test(email.value.trim())) {
                setError(email, "Please enter a valid email address");
                valid = false;
            } else {
                clearError(email);
            }

            if (!password.value) {
                setError(password, "Password is required");
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
            var form = document.querySelector("form");
            if (!form) {
                return;
            }

            var fullName = document.getElementById("fullName");
            var email = document.getElementById("email");
            var phone = document.getElementById("phoneNumber");
            var password = document.getElementById("password");
            var confirm = document.getElementById("confirmPassword");

            var radioCards = document.querySelectorAll(".radio-card");
            radioCards.forEach(function (card) {
                card.addEventListener("click", function () {
                    card.querySelector("input").checked = true;
                    radioCards.forEach(function (c) {
                        c.classList.remove("selected");
                    });
                    card.classList.add("selected");
                });
            });

            form.addEventListener("submit", function (e) {
                var valid = true;

                valid = validateField(fullName, function (v) {
                    return v.length >= 3;
                }, "Full name must be at least 3 characters") && valid;

                valid = validateField(email, function (v) {
                    return EMAIL_PATTERN.test(v);
                }, "Please enter a valid email address") && valid;

                valid = validateField(phone, function (v) {
                    return PHONE_PATTERN.test(v);
                }, "Please enter a valid phone number") && valid;

                if (!password.value) {
                    setError(password, "Password is required");
                    valid = false;
                } else if (password.value.length < 8) {
                    setError(password, "Password must be at least 8 characters");
                    valid = false;
                } else {
                    clearError(password);
                }

                if (!confirm.value) {
                    setError(confirm, "Please confirm your password");
                    valid = false;
                } else if (confirm.value !== password.value) {
                    setError(confirm, "Passwords do not match");
                    valid = false;
                } else {
                    clearError(confirm);
                }

                var selectedRole = form.querySelector('input[name="role"]:checked');
                if (!selectedRole) {
                    var roleError = document.querySelector('.field .field-error');
                    var alertBox = document.createElement("div");
                    alertBox.className = "alert alert-error";
                    alertBox.textContent = "Please select a role";
                    form.insertBefore(alertBox, form.firstChild);
                    valid = false;
                }

                if (!valid) {
                    e.preventDefault();
                }
            });
        }
    };
})(window);