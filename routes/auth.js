const express = require('express');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');
const crypto = require('crypto');
const { pool } = require('../db');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  storeRefreshToken, 
  storeUserSession, 
  revokeRefreshToken,
  createVerificationLimiter,
  authenticateToken
} = require('../middleware/auth');

const router = express.Router();

// Initialize Twilio (optional - will work without it for testing)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Rate limiting for verification codes
const verificationLimiter = createVerificationLimiter();

// Send verification code
router.post('/send-code', verificationLimiter, async (req, res) => {
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

    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    
    // Ensure it starts with country code
    const formattedPhoneNumber = cleanPhoneNumber.startsWith('1') && cleanPhoneNumber.length === 11 
      ? `+${cleanPhoneNumber}` 
      : `+1${cleanPhoneNumber}`;

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const requestId = uuidv4();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const client = await pool.connect();
    try {
      // Store code in database
      await client.query(
        'INSERT INTO verification_codes (id, phone_number, code, expires_at) VALUES ($1, $2, $3, $4)',
        [requestId, formattedPhoneNumber, code, expiresAt]
      );

      // Send SMS via Twilio if configured
      if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
        try {
          await twilioClient.messages.create({
            body: `Your Hana verification code is: ${code}. Valid for 10 minutes.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhoneNumber
          });
        } catch (smsError) {
          console.error('SMS sending failed:', smsError);
          // For development/testing, we'll still return success
          // In production, you might want to return an error
        }
      } else {
        // For development/testing without Twilio
        console.log(`[DEV] SMS Code for ${formattedPhoneNumber}: ${code}`);
      }

      res.json({
        success: true,
        message: 'Verification code sent',
        requestId: requestId
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Verify code and authenticate user
router.post('/verify-code', async (req, res) => {
  try {
    const { phoneNumber, code, platform } = req.body;

    // Clean phone number
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    const formattedPhoneNumber = cleanPhoneNumber.startsWith('1') && cleanPhoneNumber.length === 11 
      ? `+${cleanPhoneNumber}` 
      : `+1${cleanPhoneNumber}`;

    const client = await pool.connect();
    try {
      // Find verification code
      const result = await client.query(
        'SELECT * FROM verification_codes WHERE phone_number = $1 AND code = $2 AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [formattedPhoneNumber, code]
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
      await client.query(
        'UPDATE verification_codes SET used = TRUE WHERE id = $1',
        [verificationCode.id]
      );

      // Check if user exists
      let userResult = await client.query(
        'SELECT * FROM users WHERE phone_number = $1',
        [formattedPhoneNumber]
      );

      let userId;
      let isNewUser = false;
      
      if (userResult.rows.length === 0) {
        // Create new user
        userId = uuidv4();
        await client.query(
          'INSERT INTO users (id, phone_number, full_name, hair_color, is_onboarded) VALUES ($1, $2, $3, $4, $5)',
          [userId, formattedPhoneNumber, 'New User', 'unknown', false]
        );
        isNewUser = true;
      } else {
        userId = userResult.rows[0].id;
      }

      // Generate tokens
      const accessToken = generateAccessToken(userId, formattedPhoneNumber);
      const refreshToken = generateRefreshToken();

      // Store refresh token
      await storeRefreshToken(userId, refreshToken, platform);

      // Store user session
      const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
      await storeUserSession(userId, accessTokenHash, platform, req.ip);

      // Get updated user info
      const updatedUserResult = await client.query(
        'SELECT id, phone_number, full_name, hair_color, is_onboarded FROM users WHERE id = $1',
        [userId]
      );

      const user = updatedUserResult.rows[0];

      res.json({
        success: true,
        userAuth: {
          phoneNumber: formattedPhoneNumber,
          userId,
          accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
        },
        user: {
          id: user.id,
          phoneNumber: user.phone_number,
          fullName: user.full_name,
          hairColor: user.hair_color,
          isOnboarded: user.is_onboarded
        },
        isNewUser
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken, platform } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        code: 'NO_REFRESH_TOKEN',
        message: 'Refresh token required'
      });
    }

    const client = await pool.connect();
    try {
      // Find valid refresh token
      const result = await client.query(
        'SELECT rt.*, u.phone_number FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token = $1 AND rt.is_revoked = FALSE AND rt.expires_at > NOW()',
        [refreshToken]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token'
        });
      }

      const tokenData = result.rows[0];

      // Generate new tokens
      const newAccessToken = generateAccessToken(tokenData.user_id, tokenData.phone_number);
      const newRefreshToken = generateRefreshToken();

      // Revoke old refresh token
      await revokeRefreshToken(refreshToken);

      // Store new refresh token
      await storeRefreshToken(tokenData.user_id, newRefreshToken, platform);

      // Store new user session
      const accessTokenHash = crypto.createHash('sha256').update(newAccessToken).digest('hex');
      await storeUserSession(tokenData.user_id, accessTokenHash, platform, req.ip);

      res.json({
        success: true,
        userAuth: {
          phoneNumber: tokenData.phone_number,
          userId: tokenData.user_id,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
        }
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Logout (revoke refresh token)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        phoneNumber: req.user.phone_number,
        fullName: req.user.full_name,
        hairColor: req.user.hair_color,
        isOnboarded: req.user.is_onboarded
      }
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, hairColor } = req.body;

    if (!fullName || !hairColor) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Full name and hair color are required'
      });
    }

    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE users SET full_name = $1, hair_color = $2, is_onboarded = TRUE, updated_at = NOW() WHERE id = $3',
        [fullName, hairColor, req.user.id]
      );

      // Get updated user info
      const result = await client.query(
        'SELECT id, phone_number, full_name, hair_color, is_onboarded FROM users WHERE id = $1',
        [req.user.id]
      );

      res.json({
        success: true,
        user: {
          id: result.rows[0].id,
          phoneNumber: result.rows[0].phone_number,
          fullName: result.rows[0].full_name,
          hairColor: result.rows[0].hair_color,
          isOnboarded: result.rows[0].is_onboarded
        }
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

module.exports = router; 