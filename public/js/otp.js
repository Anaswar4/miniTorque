document.addEventListener('DOMContentLoaded', () => {
  const inputs = document.querySelectorAll(".otp-input");
  const otpForm = document.getElementById("otpForm");
  const statusMessage = document.getElementById("statusMessage");
  const resendBtn = document.getElementById("resendLink");
  const timerElement = document.getElementById("timer");
  const timerExpiredElement = document.getElementById("timerExpired");
  const submitBtn = otpForm.querySelector('button[type="submit"]');
  const verifyText = submitBtn.querySelector('.btn-text');
  const loader = submitBtn.querySelector('.btn-loader');

  let timeLeft = 60;
  let timerId;

  function startTimer() {
    timerElement.style.display = 'inline';
    timerExpiredElement.style.display = 'none';
    submitBtn.disabled = false;
    disableResendButton();

    if (timerId) clearInterval(timerId);

    timeLeft = 60;
    updateTimerDisplay();

    timerId = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) {
        clearInterval(timerId);
        timerElement.style.display = 'none';
        timerExpiredElement.style.display = 'block';
        submitBtn.disabled = true;
        enableResendButton();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    timerElement.textContent = `OTP expires in ${timeLeft}s`;
    timerElement.style.color = timeLeft <= 10 ? '#dc3545' : '#212529';
  }

  function disableResendButton() {
    resendBtn.disabled = true;
    resendBtn.style.pointerEvents = "none";
    resendBtn.style.opacity = 0.5;
  }

  function enableResendButton() {
    resendBtn.disabled = false;
    resendBtn.style.pointerEvents = "auto";
    resendBtn.style.opacity = 1;
  }

  function updateSubmitButtonState() {
    const allFilled = Array.from(inputs).every(input => input.value.length === 1);
    submitBtn.disabled = !allFilled || timeLeft <= 0;
  }

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 5000);
  }

  function clearStatus() {
    statusMessage.style.display = 'none';
    statusMessage.textContent = '';
    statusMessage.className = 'status-message';
  }

  inputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      input.value = input.value.replace(/\D/g, '');
      if (input.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
      clearStatus();
      updateSubmitButtonState();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && input.value === "" && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      for (let i = 0; i < paste.length && index + i < inputs.length; i++) {
        inputs[index + i].value = paste[i];
      }
      inputs[Math.min(index + paste.length, inputs.length - 1)].focus();
      updateSubmitButtonState();
    });
  });

  otpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus();

    if (timeLeft <= 0) {
      return showStatus('OTP expired. Please resend.', 'error');
    }

    const otp = Array.from(inputs).map(input => input.value).join('');
    console.log('🔢 Collected OTP:', otp);
    if (!/^\d{6}$/.test(otp)) {
      return showStatus('Invalid OTP format', 'error');
    }

    const formData = {
      otp,
      email: document.getElementById('userEmailInput').value.trim()  // ✅ fixed
    };

    try {
      submitBtn.disabled = true;
      verifyText.style.display = 'none';
      loader.style.display = 'inline';

      const response = await fetch('/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        showStatus('OTP verified! Redirecting...', 'success');
        setTimeout(() => window.location.href = '/login', 2000);
      } else {
        showStatus(data.message || 'Invalid OTP', 'error');
        submitBtn.disabled = false;
        verifyText.style.display = 'inline';
        loader.style.display = 'none';
      }
    } catch (err) {
      console.error(err);
      showStatus('Server error. Please try again.', 'error');
      submitBtn.disabled = false;
      verifyText.style.display = 'inline';
      loader.style.display = 'none';
    }
  });

  resendBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    clearStatus();

    console.log(' Resend button clicked'); // ✅ Debug

    disableResendButton();
    resendBtn.textContent = 'Sending...';

    try {
      const email = document.getElementById('userEmailInput').value.trim();  // ✅ fixed

      const response = await fetch('/resend-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (data.success) {
        showStatus('New OTP sent!', 'success');
        inputs.forEach(input => input.value = '');
        inputs[0].focus();
        startTimer(); // ✅ only if success
      } else {
        showStatus(data.message || 'Failed to resend', 'error');
        enableResendButton();
      }
    } catch (err) {
      console.error('Resend error:', err);
      showStatus('Error resending OTP', 'error');
      enableResendButton();
    } finally {
      resendBtn.textContent = 'Resend Code';
    }
  });

  startTimer();
});
