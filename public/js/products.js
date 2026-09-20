/* SANDRONMART - Seller product delete confirmation (Vanilla JavaScript) */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var modal = document.getElementById('deleteModal');
    if (!modal) {
      return;
    }

    var productNameEl = document.getElementById('deleteProductName');
    var cancelBtn = document.getElementById('deleteCancel');
    var confirmBtn = document.getElementById('deleteConfirm');
    var pendingForm = null;

    function openModal(formId, productName) {
      pendingForm = document.getElementById(formId);
      if (!pendingForm) {
        return;
      }
      productNameEl.textContent = productName;
      modal.hidden = false;
      confirmBtn.focus();
    }

    function closeModal() {
      modal.hidden = true;
      pendingForm = null;
    }

    document.querySelectorAll('.js-confirm-delete').forEach(function (button) {
      button.addEventListener('click', function () {
        openModal(button.dataset.deleteForm, button.dataset.productName);
      });
    });

    confirmBtn.addEventListener('click', function () {
      if (pendingForm) {
        pendingForm.submit();
      }
    });

    cancelBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        closeModal();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });
  });
})();