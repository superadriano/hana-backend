const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Access token required'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      });
    }
    req.user = user;
    next();
  });
};

// Create user profile
router.post('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, hairColor, platform } = req.body;
    const { userId } = req.user;

    // Validate input
    if (!fullName || !hairColor) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: 'Full name and hair color are required'
      });
    }

    // Update user profile
    await pool.query(
      'UPDATE users SET full_name = $1, hair_color = $2, updated_at = NOW() WHERE id = $3',
      [fullName, hairColor, userId]
    );

    res.json({
      success: true,
      message: 'Profile created successfully'
    });

  } catch (error) {
    console.error('Create profile error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      profile: {
        userId: user.id,
        phoneNumber: user.phone_number,
        fullName: user.full_name,
        hairColor: user.hair_color,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
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
    const { userId } = req.user;

    // Validate input
    if (!fullName || !hairColor) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: 'Full name and hair color are required'
      });
    }

    // Update user profile
    await pool.query(
      'UPDATE users SET full_name = $1, hair_color = $2, updated_at = NOW() WHERE id = $3',
      [fullName, hairColor, userId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

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