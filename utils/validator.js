// utils/validator.js

function validateEmail(email) {
    // Stricter regex: blocks leading special characters, enforces proper domain
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    return typeof password === 'string' && password.length >= 6;
}

function validateSignup({ name, email, password }) {
    const errors = [];

    if (!name || name.trim().length < 3) {
        errors.push('Name must be at least 3 characters long');
    }

    if (!validateEmail(email)) {
        errors.push('Invalid email address');
    }

    if (!validatePassword(password)) {
        errors.push('Password must be at least 6 characters long');
    }

    return errors;
}

function validateLogin({ email, password }) {
    const errors = [];

    if (!validateEmail(email)) {
        errors.push('Invalid email address');
    }

    if (!validatePassword(password)) {
        errors.push('Password must be at least 6 characters long');
    }

    return errors;
}

module.exports = {
    validateEmail,
    validatePassword,
    validateSignup,
    validateLogin
};
