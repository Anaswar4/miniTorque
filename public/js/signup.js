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
    const index = Math.max(0, result.score - 1); // Ensure index is not negative
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
    e.preventDefault(); // Prevent default submission to test validation first
    let error = false;

    // Check if all fields are empty
    const isAllEmpty = [fullNameInput, emailInput, passwordInput, confirmInput].every(
      (input) => input.value.trim() === ""
    );

    // Clear previous errors
    [fullNameInput, emailInput, passwordInput, confirmInput].forEach((input) => {
      clearError(input);
      if (input.value.trim() === "") {
        showError(input, `${input.getAttribute("name")} is required.`);
        error = true;
      }
    });

    // Validate full name
    if (fullNameInput.value.trim() !== "" && !/^[a-zA-Z\s]{2,}$/.test(fullNameInput.value)) {
      showError(fullNameInput, "Full name must contain only letters and be at least 2 characters.");
      error = true;
    }

    // Validate email
    const emailRegex = /^[a-zA-Z0-9]+([._%+-]?[a-zA-Z0-9])*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (emailInput.value.trim() !== "" && !emailRegex.test(emailInput.value)) {
      showError(emailInput, "Please enter a valid email address.");
      error = true;
    }

    // Validate password
    const pwdCheck = validatePassword(passwordInput.value);
    if (passwordInput.value.trim() !== "" && !pwdCheck.isValid) {
      showError(passwordInput, "Password must meet all requirements.");
      error = true;
    }

    // Validate confirm password
    if (confirmInput.value.trim() !== "" && passwordInput.value !== confirmInput.value) {
      showError(confirmInput, "Passwords do not match.");
      error = true;
    }

    // If there are errors, shake the form and show SweetAlert
    if (error) {
      // Remove shake class if already present to allow retrigger
      form.classList.remove("shake");
      // Force reflow to reset animation
      void form.offsetWidth;
      // Add shake class
      form.classList.add("shake");
      // Remove shake class after animation ends
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
      // If no errors, submit the form
      form.submit();
    }
  });
});