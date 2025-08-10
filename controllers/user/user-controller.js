const { sendOTP } = require('../../utils/mailer');
const generateOTP = require('../../utils/generate-otp');
const { validateEmail, validatePassword } = require('../../utils/validator');
const userModel = require('../../models/user-model');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

// Rate-limiting middleware for resend-otp
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
});

// Show signup page
const showSignup = (req, res) => {
  return res.render('user/signup', {
    error: null,
    formData: {},
  });
};

// Load home page
const loadHome = (req, res) => {
  try {
    const navLinks = [
      { href: '#home', text: 'Home', active: true },
      { href: '#collection', text: 'Collection', active: false },
      { href: '#about', text: 'About', active: false },
      { href: '#contact', text: 'Contact', active: false }
    ];

    const slides = [
      { image: '/images/banner1.jpg', title: 'Limited Edition Cars', description: 'Exclusive models only at miniTorque.' },
      { image: '/images/banner2.jpg', title: 'Premium Detailing', description: 'Every diecast tells a story.' },
      { image: '/images/banner3.jpg', title: 'Diecast', description: 'Projection of a real car.' }
    ];

    const products = [
      { image: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', title: 'Lamborghini Aventador', price: '₹1499' },
      { image: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', title: 'Ferrari LaFerrari', price: '₹1699' },
      { image: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', title: 'Porsche 911 GT3', price: '₹1599' }
    ];

    res.render('user/home', {
      user: req.user || null,
      slides,
      products,
      navLinks
    });
  } catch (error) {
    console.error('Error in loadHome:', error.message);
    res.status(500).send('Internal Server Error');
  }
};

// Handle signup and initiate OTP
const signup = async (req, res) => {
  const { fullName, email, password, confirmPassword } = req.body;

  if (!fullName || !email || !password || !confirmPassword) {
    return res.render('user/signup', {
      error: 'All fields are required',
      formData: { fullName, email },
    });
  }

  const exists = await userModel.findOne({ email });
  if (exists) {
    return res.render('user/signup', {
      error: 'Email already exists',
      formData: { fullName, email },
    });
  }

  if (!validateEmail(email) || !validatePassword(password)) {
    return res.render('user/signup', {
      error: 'Invalid email or weak password',
      formData: { fullName, email },
    });
  }

  if (password !== confirmPassword) {
    return res.render('user/signup', {
      error: 'Passwords do not match',
      formData: { fullName, email },
    });
  }

  try {
    const otp = generateOTP();
    console.log('Otp is:', otp);

    await sendOTP(email, otp);
    const hashedPassword = await bcrypt.hash(password, 10);

    req.session.tempUser = {
      fullName: fullName.trim(),
      email,
      password: hashedPassword,
      otp,
      isVerified: false,
    };
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;

    req.session.save((err) => {
      if (err) {
        console.error('Session Save Error:', err);
        return res.status(500).render('user/signup', {
          error: 'Something went wrong. Please try again.',
          formData: { fullName, email },
        });
      }

      return res.render('otp', { email, success: null, error: null });
    });
  } catch (error) {
    console.error('Signup Error:', error.message);
    res.status(400).render('user/signup', {
      error: 'Failed to send OTP. Try again',
      formData: { fullName, email },
    });
  }
};

// Load OTP page
const loadOtpPage = (req, res) => {
  const { tempUser } = req.session;
  if (!tempUser || !tempUser.email) {
    return res.redirect('/signup');
  }
  return res.render('otp', { email: tempUser.email, success: null, error: null });
};

// Handle OTP verification
const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  const userOTP = otp;
  const { tempUser, otpExpires } = req.session;

  try {
    if (!tempUser || !otpExpires || tempUser.email !== email) {
      req.session.tempUser = null;
      req.session.otpExpires = null;
      throw new Error('Session expired or invalid email. Try signing up again.');
    }

    if (Date.now() > otpExpires) {
      req.session.tempUser = null;
      req.session.otpExpires = null;
      throw new Error('OTP expired. Please sign up again.');
    }

    if (!userOTP || !/^\d{6}$/.test(userOTP)) {
      throw new Error('Invalid OTP format');
    }

    if (userOTP !== tempUser.otp) {
      throw new Error('Invalid OTP');
    }

    await userModel.create({
      fullName: tempUser.fullName,
      email: tempUser.email,
      password: tempUser.password,
      isVerified: true,
    });

    req.session.tempUser = null;
    req.session.otpExpires = null;

    res.json({ success: true, redirectUrl: '/login' });
  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Resend OTP function
const resendOTP = async (req, res, next) => {
  try {
    await resendLimiter(req, res, async () => {
      const { email } = req.body;
      const { tempUser } = req.session;

      if (!tempUser || tempUser.email !== email) {
        req.session.tempUser = null;
        req.session.otpExpires = null;
        throw new Error('Session expired. Please sign up again.');
      }

      const newOTP = generateOTP();
      console.log('newOtp is:', newOTP);

      req.session.tempUser.otp = newOTP;
      req.session.otpExpires = Date.now() + 5 * 60 * 1000;

      await sendOTP(tempUser.email, newOTP);

      res.json({ success: true, message: 'OTP resent successfully' });
    });
  } catch (error) {
    console.error('Resend OTP Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to resend OTP. Try again later.' });
  }
};

// Show login page
const showLogin = async (req, res) => {
  if (req.session.userId) return res.redirect('/home');
  return res.render('user/login', { error: null });
};

// Handle login (FIXED for your issue)
const login = async (req, res, next) => {
  const { email, password } = req.body;

  // ✅ FIX: Check only email format + non-empty password
  if (!validateEmail(email) || typeof password !== "string" || password.trim() === "") {
    return res.render('user/login', {
      error: 'Invalid email or password',
    });
  }

  try {
    const user = await userModel.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render('user/login', {
        error: 'Invalid credentials',
      });
    }

    if (!user.isVerified) {
      return res.render('user/login', {
        error: 'Please verify your email before logging in',
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regen error:', err);
        return res.status(500).render('user/login', {
          error: 'Session error. Please try again.',
        });
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Passport login error:', err);
          return res.status(500).render('user/login', {
            error: 'Login failed. Please try again.',
          });
        }

        req.session.userId = user._id;
        req.session.email = user.email;
        req.session.loginTime = new Date();

        req.session.save((err) => {
          if (err) {
            console.error('Login session save error:', err);
            return res.status(500).render('user/login', {
              error: 'Login failed. Please try again.',
            });
          }

          console.log('Normal login successful, redirecting to /home');
          return res.redirect('/home');
        });
      });
    });
  } catch (err) {
    console.error('Error in login:', err);
    res.status(500).render('user/login', {
      error: 'Something went wrong. Please try again.',
    });
  }
};

// Handle logout
const logout = async (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
};

// Forgot password + OTP verification
const forgotPasswordPage = (req, res) => res.render('user/forgot-password', { error: null });

const handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const user = await userModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, message: 'Email not found' });
    if (!user.isVerified) return res.status(403).json({ success: false, message: 'Account not verified' });

    const otp = generateOTP();
    await sendOTP(email, otp);
    req.session.forgotOtp = otp;
    req.session.forgotEmail = email;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;

    console.log('Forgot password OTP:', otp);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Forgot Password Error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const showForgotOtpPage = (req, res) => {
  if (!req.session.forgotEmail) return res.redirect('/forgot-password');
  res.render('user/forgot-verify-otp', { email: req.session.forgotEmail });
};

const verifyForgotOtp = (req, res) => {
  const { otp } = req.body;
  const sessionOtp = req.session.forgotOtp;
  const otpExpires = req.session.otpExpires;

  if (!sessionOtp || Date.now() > otpExpires) {
    return res.status(400).json({
      success: false,
      message: 'OTP expired. Please request a new one.',
    });
  }

  if (otp !== sessionOtp) {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP. Please try again.',
    });
  }

  req.session.otpVerified = true;
  return res.json({ success: true, redirectUrl: '/reset-password' });
};

const resendForgotOtp = async (req, res) => {
  try {
    const email = req.session.forgotEmail;
    if (!email) return res.status(400).json({ success: false, message: 'Session expired. Try again.' });

    const otp = generateOTP();
    await sendOTP(email, otp);
    req.session.forgotOtp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;

    console.log('Resent forgot-password OTP:', otp);
    return res.json({ success: true });
  } catch (error) {
    console.error('Resend Forgot OTP Error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

const renderResetPasswordPage = (req, res) => {
  if (!req.session.otpVerified || !req.session.forgotEmail) {
    return res.redirect('/forgot-password');
  }
  res.render('user/new-password');
};

const handleNewPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    if (!req.session.otpVerified || !req.session.forgotEmail) {
      return res.status(400).json({ success: false, message: 'Session expired or unauthorized access.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ success: false, message: 'Password is not strong enough.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedUser = await userModel.findOneAndUpdate(
      { email: req.session.forgotEmail },
      { password: hashedPassword }
    );
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    req.session.forgotEmail = null;
    req.session.forgotOtp = null;
    req.session.otpVerified = null;
    req.session.otpExpires = null;

    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('handleNewPassword Error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = {
  loadHome,
  showLogin,
  login,
  showSignup,
  signup,
  loadOtpPage,
  verifyOTP,
  resendOTP,
  logout,
  forgotPasswordPage,
  handleForgotPassword,
  showForgotOtpPage,
  verifyForgotOtp,
  resendForgotOtp,
  renderResetPasswordPage,
  handleNewPassword,
};
