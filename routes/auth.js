const express = require('express');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const { pool } = require('../db');

const router = express.Router();

// Initialize Twilio (optional - will work without it for testing)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Send verification code
router.post('/send-code', async (req, res) => {
  try {
    const { phoneNumber, platform } = req.body;

    // Validate phone number
    if (!phoneNumber || phoneNumber.length < 10) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHONE',
        message: 'Invalid phone number'
      });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const requestId = uuidv4();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store code in database
    await pool.query(
      'INSERT INTO verification_codes (id, phone_number, code, expires_at) VALUES ($1, $2, $3, $4)',
      [requestId, phoneNumber, code, expiresAt]
    );

    // Send SMS via Twilio if configured
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      try {
        await twilioClient.messages.create({
          body: `Your Hana verification code is: ${code}. Valid for 10 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phoneNumber
        });
      } catch (smsError) {
        console.error('SMS sending failed:', smsError);
        // For development/testing, we'll still return success
        // In production, you might want to return an error
      }
    } else {
      // For development/testing without Twilio
      console.log(`[DEV] SMS Code for ${phoneNumber}: ${code}`);
    }

    res.json({
      success: true,
      message: 'Verification code sent',
      requestId: requestId
    });

  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Verify code
router.post('/verify-code', async (req, res) => {
  try {
    const { phoneNumber, code, platform } = req.body;

    // Find verification code
    const result = await pool.query(
      'SELECT * FROM verification_codes WHERE phone_number = $1 AND code = $2 AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [phoneNumber, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CODE',
        message: 'Invalid or expired verification code'
      });
    }

    const verificationCode = result.rows[0];

    // Mark code as used
    await pool.query(
      'UPDATE verification_codes SET used = TRUE WHERE id = $1',
      [verificationCode.id]
    );

    // Check if user exists
    let userResult = await pool.query(
      'SELECT * FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    let userId;
    if (userResult.rows.length === 0) {
      // Create new user
      userId = uuidv4();
      await pool.query(
        'INSERT INTO users (id, phone_number, full_name, hair_color) VALUES ($1, $2, $3, $4)',
        [userId, phoneNumber, 'New User', 'unknown']
      );
    } else {
      userId = userResult.rows[0].id;
    }

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { userId, phoneNumber },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    const refreshToken = uuidv4();

    res.json({
      success: true,
      userAuth: {
        phoneNumber,
        userId,
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + (process.env.JWT_EXPIRES_IN || 3600) * 1000).toISOString()
      }
    });

  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken, platform } = req.body;

    // In a real implementation, you'd validate the refresh token
    // For this example, we'll just generate a new access token
    const accessToken = jwt.sign(
      { userId: 'user_id', phoneNumber: 'phone_number' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    res.json({
      success: true,
      userAuth: {
        phoneNumber: '+1234567890',
        userId: 'user_id',
        accessToken,
        refreshToken: uuidv4(),
        expiresAt: new Date(Date.now() + (process.env.JWT_EXPIRES_IN || 3600) * 1000).toISOString()
      }
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

module.exports = router; 