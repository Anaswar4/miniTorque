// miniTorque Login Page JavaScript

document.addEventListener('DOMContentLoaded', () => {
    initializeFormValidation();
    initializePasswordToggle();
    initializeFormSubmission();
    initializeSocialButtons();
    initializeInputAnimations();
    insertShakeAnimationCSS();
});

// -----------------------------
// 🧪 Form Validation
// -----------------------------
function initializeFormValidation() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    emailInput.addEventListener('input', () => validateEmail(emailInput));
    emailInput.addEventListener('blur', () => validateEmail(emailInput));

    passwordInput.addEventListener('input', () => validatePassword(passwordInput));
    passwordInput.addEventListener('blur', () => validatePassword(passwordInput));
}

function validateEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(input.value.trim());
    return setValidationState(input, isValid, 'Please enter a valid email address');
}

function validatePassword(input) {
    const isValid = input.value.trim().length >= 8;
    return setValidationState(input, isValid, 'Password must be at least 8 characters long');
}

function setValidationState(input, isValid, message) {
    const feedback = input.parentNode.querySelector('.invalid-feedback') || input.closest('.mb-3').querySelector('.invalid-feedback');
    
    input.classList.remove('is-valid', 'is-invalid');

    if (!input.value.trim()) {
        input.classList.add('is-invalid');
        if (feedback) {
            feedback.textContent = message;
            feedback.style.display = 'block';
        }
        return false;
    }

    if (isValid) {
        input.classList.add('is-valid');
        if (feedback) feedback.style.display = 'none';
    } else {
        input.classList.add('is-invalid');
        if (feedback) {
            feedback.textContent = message;
            feedback.style.display = 'block';
        }
    }

    return isValid;
}

// -----------------------------
// 👁 Toggle Password Visibility
// -----------------------------
function initializePasswordToggle() {
    const toggleBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const isText = passwordInput.type === 'text';
            passwordInput.type = isText ? 'password' : 'text';

            const icon = toggleBtn.querySelector('i');
            icon.classList.toggle('fa-eye', isText);
            icon.classList.toggle('fa-eye-slash', !isText);
        });
    }
}

// -----------------------------
// 🚀 Submit Login Form
// -----------------------------
function initializeFormSubmission() {
  const form = document.getElementById('loginForm');
  const loginBtn = form.querySelector('.login-btn');
  const btnText = loginBtn.querySelector('.btn-text');
  const btnLoading = loginBtn.querySelector('.btn-loading');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    const isEmailValid = validateEmail(emailInput);
    const isPasswordValid = validatePassword(passwordInput);

    if (!isEmailValid || !isPasswordValid) {
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 500);
      return;
    }

    setLoadingState(loginBtn, btnText, btnLoading, true);

    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded', // Important!
                  },
        body: new URLSearchParams({
          email: emailInput.value.trim(),
          password: passwordInput.value.trim()
        })
      });

      // Handle redirect manually
      if (response.redirected) {
        window.location.href = response.url; // ✅ Redirect to /home
      } else {
        const html = await response.text();
        document.open();
        document.write(html);
        document.close();
      }

    } catch (error) {
      console.error('Login failed:', error);
      showAlert('danger', 'Server error. Please try again.');
    } finally {
      setLoadingState(loginBtn, btnText, btnLoading, false);
    }
  });
}


function setLoadingState(btn, textEl, loadingEl, isLoading) {
    btn.disabled = isLoading;
    textEl.classList.toggle('d-none', isLoading);
    loadingEl.classList.toggle('d-none', !isLoading);
}

function handleLoginResponse(data, btn, textEl, loadingEl) {
    setLoadingState(btn, textEl, loadingEl, false);
    showAlert('success', `Welcome to miniTorque!<br><small>${data.email}</small>`);
    // window.location.href = '/dashboard'; // Uncomment for actual redirect
}

// -----------------------------
// 💬 Alert & Info Message
// -----------------------------
function showAlert(type, message) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show fixed-alert`;
    alert.role = 'alert';
    alert.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

function showInfoMessage(msg) {
    showAlert('info', msg);
}

// -----------------------------
// 🔘 Social Button Loader
// -----------------------------
function initializeSocialButtons() {
    const socialBtns = document.querySelectorAll('.social-btn');

    socialBtns.forEach(btn => {
        const provider = btn.textContent.trim().toLowerCase();

        if (provider.includes('facebook')) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                const original = this.innerHTML;
                this.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>${btn.textContent.trim()}`;
                this.disabled = true;
                setTimeout(() => {
                    this.innerHTML = original;
                    this.disabled = false;
                    showInfoMessage(`${provider} login coming soon!`);
                }, 1500);
            });
        }
    });
}


// -----------------------------
// ✨ Input Animations
// -----------------------------
function initializeInputAnimations() {
    document.querySelectorAll('.custom-input').forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.classList.add('focused');
        });
        input.addEventListener('blur', () => {
            input.parentElement.classList.remove('focused');
        });
    });
}

// -----------------------------
// 🔄 Shake Animation CSS
// -----------------------------
function insertShakeAnimationCSS() {
    const style = document.createElement('style');
    style.textContent = `
        .shake {
            animation: shake 0.5s ease-in-out;
        }
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .fixed-alert {
            position: fixed;
            top: 20px;
            right: 20px;
            max-width: 350px;
            z-index: 1050;
        }
    `;
    document.head.appendChild(style);
}

// -----------------------------
// 🔐 Forgot Password Info
// -----------------------------
// document.addEventListener('click', function (e) {
//     if (e.target.classList.contains('forgot-password')) {
//         e.preventDefault();
//         showInfoMessage('Password reset coming soon!');
//     }
// });
