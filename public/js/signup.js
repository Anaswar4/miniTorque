document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirmPassword");
  const emailInput = document.getElementById("email");
  const fullNameInput = document.getElementById("fullName");
  const toggleButtons = document.querySelectorAll(".toggle-password");
  const strengthFill = document.querySelector(".strength-fill");
  const strengthValue = document.querySelector(".strength-value");
  const requirements = {
    length: document.getElementById("length"),
    uppercase: document.getElementById("uppercase"),
    lowercase: document.getElementById("lowercase"),
    special: document.getElementById("special"),
  };
  const form = document.getElementById("signupForm");

  // ========== REFERRAL CODE FUNCTIONALITY ========== 
  let appliedReferralCode = null;
  window.appliedReferralCode = null;

  const referralCodeInput = document.getElementById('referralCodeInput');
  const referralCodeError = document.getElementById('referralCodeError');
  const referralCodeSuccess = document.getElementById('referralCodeSuccess');
  const applyReferralBtn = document.getElementById('applyReferralBtn');
  const referralCodeField = document.getElementById('referralCodeField');

  // Check URL for ?ref=CODE parameter
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  if (refCode) {
    setTimeout(() => {
      const modal = new bootstrap.Modal(document.getElementById('referralModal'));
      modal.show();
      referralCodeInput.value = refCode.toUpperCase();
    }, 500);
  }

  // Real-time referral code validation
  if (referralCodeInput) {
    referralCodeInput.addEventListener('input', function() {
      const code = this.value.trim().toUpperCase();
      this.value = code;

      referralCodeError.textContent = '';
      referralCodeSuccess.textContent = '';

      if (code.length === 0) {
        applyReferralBtn.disabled = false;
        return;
      }

      if (code.length < 6) {
        referralCodeError.textContent = 'Referral code must be at least 6 characters';
        applyReferralBtn.disabled = true;
      } else {
        applyReferralBtn.disabled = false;
      }
    });
  }

  // Apply referral code
  if (applyReferralBtn) {
    applyReferralBtn.addEventListener('click', async function() {
      const code = referralCodeInput.value.trim().toUpperCase();

      if (!code) {
        bootstrap.Modal.getInstance(document.getElementById('referralModal')).hide();
        return;
      }

      const originalText = this.innerHTML;
      this.disabled = true;
      this.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Validating...';

      try {
        const response = await fetch('/api/referral/validate?code=' + code, {
          method: 'GET'
        });

        const result = await response.json();

        if (result.valid) {
          referralCodeSuccess.textContent = `✓ Valid referral code from ${result.referrerName}!`;
          referralCodeError.textContent = '';
          appliedReferralCode = code;
          window.appliedReferralCode = code;
          referralCodeField.value = code;

          setTimeout(() => {
            bootstrap.Modal.getInstance(document.getElementById('referralModal')).hide();

            Swal.fire({
              icon: 'success',
              title: 'Referral Code Applied!',
              text: `You'll be referred by ${result.referrerName}`,
              timer: 3000,
              showConfirmButton: false,
              toast: true,
              position: 'top-end'
            });
          }, 1500);
        } else {
          referralCodeError.textContent = 'Invalid referral code';
          referralCodeSuccess.textContent = '';
        }
      } catch (error) {
        console.error('Error validating referral code:', error);
        referralCodeError.textContent = 'Error validating referral code. Please try again.';
        referralCodeSuccess.textContent = '';
      }

      this.disabled = false;
      this.innerHTML = originalText;
    });
  }

  // Reset modal when closed
  const referralModal = document.getElementById('referralModal');
  if (referralModal) {
    referralModal.addEventListener('hidden.bs.modal', function() {
      if (!appliedReferralCode) {
        referralCodeInput.value = '';
        referralCodeError.textContent = '';
        referralCodeSuccess.textContent = '';
      }
    });
  }
  // ========== END REFERRAL CODE FUNCTIONALITY ==========

  function validatePassword(value) {
    const hasLength = value.length >= 8;
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);
    return {
      hasLength,
      hasUpper,
      hasLower,
      hasSpecial,
      isValid: hasLength && hasUpper && hasLower && hasSpecial,
      score: [hasLength, hasUpper, hasLower, hasSpecial].filter(Boolean).length,
    };
  }

  function updateRequirement(el, valid) {
    const icon = el.querySelector("i");
    if (valid) {
      icon.classList.remove("fa-circle");
      icon.classList.add("fa-check-circle", "text-success");
    } else {
      icon.classList.remove("fa-check-circle", "text-success");
      icon.classList.add("fa-circle");
    }
  }

  function updatePasswordStrength(value, result) {
    const percent = (result.score / 4) * 100;
    strengthFill.style.width = `${percent}%`;
    strengthFill.className = "strength-fill";
    strengthValue.className = "strength-value";

    if (value === "") {
      strengthFill.style.width = "0%";
      strengthValue.textContent = "Enter Password";
      return;
    }

    const classes = ["very-weak", "weak", "fair", "strong"];
    const labels = ["Very Weak", "Weak", "Fair", "Strong"];
    const index = Math.max(0, result.score - 1);
    strengthValue.textContent = labels[index];
    strengthFill.classList.add(classes[index]);
    strengthValue.classList.add(classes[index]);

    updateRequirement(requirements.length, result.hasLength);
    updateRequirement(requirements.uppercase, result.hasUpper);
    updateRequirement(requirements.lowercase, result.hasLower);
    updateRequirement(requirements.special, result.hasSpecial);
  }

  toggleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (target.type === "password") {
        target.type = "text";
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
      } else {
        target.type = "password";
        btn.innerHTML = '<i class="fas fa-eye"></i>';
      }
    });
  });

  fullNameInput.addEventListener("input", () => {
    clearError(fullNameInput);
    if (/^[a-zA-Z\s]{2,}$/.test(fullNameInput.value)) {
      fullNameInput.classList.add("simple-valid");
    } else {
      showError(fullNameInput, "Full name must contain only letters and be at least 2 characters.");
    }
  });

  emailInput.addEventListener("input", () => {
    clearError(emailInput);
    const regex = /^[a-zA-Z0-9]+([._%+-]?[a-zA-Z0-9])*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (regex.test(emailInput.value)) {
      emailInput.classList.add("simple-valid");
    } else {
      showError(emailInput, "Please enter a valid email address.");
    }
  });

  passwordInput.addEventListener("input", () => {
    const val = passwordInput.value;
    const result = validatePassword(val);
    clearError(passwordInput);
    updatePasswordStrength(val, result);

    if (val === "") return;
    if (result.isValid) {
      passwordInput.classList.add("simple-valid");
    } else {
      showError(passwordInput, "Password must include all required conditions.");
    }

    if (confirmInput.value.length > 0) validateConfirmPassword();
  });

  confirmInput.addEventListener("input", () => {
    validateConfirmPassword();
  });

  function validateConfirmPassword() {
    clearError(confirmInput);
    if (confirmInput.value === "") return;
    if (passwordInput.value !== confirmInput.value) {
      showError(confirmInput, "Passwords do not match.");
    } else {
      confirmInput.classList.add("simple-valid");
    }
  }

  function clearError(input) {
    input.classList.remove("simple-error", "simple-valid");
    const error = input.closest(".form-group").querySelector(".simple-error");
    if (error) error.remove();
  }

  function showError(input, message) {
    const parent = input.closest(".form-group");
    input.classList.add("simple-error");
    const error = document.createElement("div");
    error.className = "simple-error";
    error.textContent = message;
    parent.appendChild(error);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let error = false;

    const isAllEmpty = [fullNameInput, emailInput, passwordInput, confirmInput].every(
      (input) => input.value.trim() === ""
    );

    [fullNameInput, emailInput, passwordInput, confirmInput].forEach((input) => {
      clearError(input);
      if (input.value.trim() === "") {
        showError(input, `${input.getAttribute("name")} is required.`);
        error = true;
      }
    });

    if (fullNameInput.value.trim() !== "" && !/^[a-zA-Z\s]{2,}$/.test(fullNameInput.value)) {
      showError(fullNameInput, "Full name must contain only letters and be at least 2 characters.");
      error = true;
    }

    const emailRegex = /^[a-zA-Z0-9]+([._%+-]?[a-zA-Z0-9])*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (emailInput.value.trim() !== "" && !emailRegex.test(emailInput.value)) {
      showError(emailInput, "Please enter a valid email address.");
      error = true;
    }

    const pwdCheck = validatePassword(passwordInput.value);
    if (passwordInput.value.trim() !== "" && !pwdCheck.isValid) {
      showError(passwordInput, "Password must meet all requirements.");
      error = true;
    }

    if (confirmInput.value.trim() !== "" && passwordInput.value !== confirmInput.value) {
      showError(confirmInput, "Passwords do not match.");
      error = true;
    }

    if (error) {
      form.classList.remove("shake");
      void form.offsetWidth;
      form.classList.add("shake");
      form.addEventListener(
        "animationend",
        () => {
          form.classList.remove("shake");
        },
        { once: true }
      );

      if (isAllEmpty) {
        Swal.fire({
          icon: "warning",
          title: "Empty Form",
          text: "Please fill the form before submitting.",
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Validation Error",
          text: "Please fix the errors in the form.",
        });
      }
    } else {
      // Set referral code in hidden field before submission
      if (window.appliedReferralCode) {
        referralCodeField.value = window.appliedReferralCode;
      }
      form.submit();
    }
  });
});
