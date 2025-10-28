const nodemailer = require('nodemailer');
const validator = require('validator');
require('dotenv').config();

// Validate environment variables at startup
const { NODEMAILER_EMAIL, NODEMAILER_PASSWORD } = process.env;
if (!NODEMAILER_EMAIL || !NODEMAILER_PASSWORD) {
  throw new Error('Missing NODEMAILER_EMAIL or NODEMAILER_PASSWORD in environment variables');
}

// Initialize transporter with connection pooling
const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 5,
  auth: {
    user: NODEMAILER_EMAIL,
    pass: NODEMAILER_PASSWORD, // App Password for Gmail
  },
});

// Verify transporter connection at startup
transporter.verify((error) => {
  if (error) {
    console.error('SMTP connection error:', error);
    throw new Error('Failed to connect to SMTP server');
  }
  
});

/**
 * Sends a 6-digit OTP email to the specified email address.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} otp - The 6-digit OTP code to send.
 * @returns {Promise<{success: boolean, message: string}>} Result of the operation.
 * @throws {Error} If email sending fails or inputs are invalid.
 */
async function sendOTP(toEmail, otp) {
  // Validate inputs
  if (!toEmail || !validator.isEmail(toEmail)) {
    throw new Error('Invalid email address');
  }
  if (!otp || !/^\d{6}$/.test(otp)) {
    throw new Error('Invalid OTP format: must be 6 digits');
  }

  try {
    // Define email options
   const mailOptions = {
  from: `"miniTorque" <${NODEMAILER_EMAIL}>`,
  to: toEmail,
  subject: 'Your Verification Code - miniTorque',
  html: `
    <div style="
      max-width: 600px;
      margin: 0 auto;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    ">
      <!-- Header -->
      <div style="
        background: rgba(255,255,255,0.1);
        padding: 30px;
        text-align: center;
        backdrop-filter: blur(10px);
      ">
        <h1 style="
          color: #ffffff;
          margin: 0;
          font-size: 32px;
          font-weight: 700;
          text-shadow: 0 2px 10px rgba(0,0,0,0.3);
          letter-spacing: 2px;
        ">miniTorque</h1>
        <p style="
          color: rgba(255,255,255,0.9);
          margin: 8px 0 0 0;
          font-size: 16px;
          font-weight: 300;
        ">Verification Required</p>
      </div>

      <!-- Content -->
      <div style="
        background: #ffffff;
        padding: 40px 30px;
        text-align: center;
      ">
        <div style="
          background: linear-gradient(135deg, #ff0019 0%, #ff4757 100%);
          width: 80px;
          height: 80px;
          border-radius: 50%;
          margin: 0 auto 30px auto;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 25px rgba(255,0,25,0.3);
        ">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7v10c0 5.55 3.84 10 9 9 5.16 1 9-3.45 9-9V7l-10-5z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        
        <h2 style="
          color: #2c3e50;
          margin: 0 0 20px 0;
          font-size: 24px;
          font-weight: 600;
        ">Verification Code</h2>
        
        <p style="
          color: #7f8c8d;
          margin: 0 0 30px 0;
          font-size: 16px;
          line-height: 1.6;
        ">Enter the following code to complete your verification:</p>
        
        <!-- OTP Container -->
        <div style="
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border: 2px dashed #dee2e6;
          border-radius: 12px;
          padding: 25px;
          margin: 0 0 30px 0;
          display: inline-block;
          min-width: 200px;
        ">
          <div style="
            font-size: 36px;
            font-weight: 700;
            color: #2c3e50;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
          ">${otp.replace(/[^0-9]/g, '')}</div>
        </div>
        
        <!-- Timer -->
        <div style="
          background: rgba(255,0,25,0.1);
          border: 1px solid rgba(255,0,25,0.2);
          border-radius: 8px;
          padding: 15px;
          margin: 0 0 30px 0;
        ">
          <p style="
            color: #ff0019;
            margin: 0;
            font-size: 14px;
            font-weight: 600;
          "> This code expires in 5 minutes</p>
        </div>
        
        <p style="
          color: #95a5a6;
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
        ">If you didn't request this verification, please ignore this email.<br>
        This is an automated message, please do not reply.</p>
      </div>  
      <!-- Footer -->
      <div style="
        background: #2c3e50;
        padding: 20px;
        text-align: center;
      ">
        <p style="
          color: rgba(255,255,255,0.7);
          margin: 0;
          font-size: 12px;
        ">© 2024 miniTorque. All rights reserved.</p>
      </div>
    </div>
  `,
  text: `miniTorque - Verification Required
  
Your 6-digit verification code is: ${otp}

This code is valid for 5 minutes.

If you didn't request this verification, please ignore this email.

© 2024 miniTorque. All rights reserved.`,
};

    // Send email
    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${toEmail}`);
    return { success: true, message: 'Verification code sent successfully' };
  } catch (error) {
    console.error(`Error sending OTP to ${toEmail}:`, error);
    throw new Error('Failed to send verification code');
  }
}

module.exports = { sendOTP };