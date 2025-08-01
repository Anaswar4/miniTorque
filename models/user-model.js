const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
  },
  password: {
    type: String,
    required: function () {
      return this.authMethod !== 'google';
    },
    minlength: [8, 'Password must be at least 8 characters long'],
  },
  googleId: {
    type: String,
    default: null,
    sparse: true,
    unique: true,
  },
  picture: {
    type: String,
    default: null,
  },
  authMethod: {
    type: String,
    enum: ['local', 'google'],
    default: 'local',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
   isAdmin: {
    type: Boolean,
    default: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;