const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

// JWT Secret - in production, this should be a strong secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// Generate JWT token
function generateAccessToken(userId, phoneNumber) {
  return jwt.sign(
    { 
      userId, 
      phoneNumber,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Generate refresh token
function generateRefreshToken() {
  return uuidv4();
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Authentication middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'NO_TOKEN',
      message: 'Access token required'
    });
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      });
    }

    // Check if token is still valid in database
    const client = await pool.connect();
    try {
      const sessionResult = await client.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [decoded.userId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          code: 'SESSION_EXPIRED',
          message: 'Session expired'
        });
      }

      // Get user info
      const userResult = await client.query(
        'SELECT id, phone_number, full_name, hair_color, is_onboarded FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        });
      }

      req.user = userResult.rows[0];
      req.token = decoded;
      next();
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      code: 'AUTH_ERROR',
      message: 'Authentication failed'
    });
  }
}

// Store refresh token in database
async function storeRefreshToken(userId, refreshToken, deviceInfo = null) {
  const client = await pool.connect();
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await client.query(
      'INSERT INTO refresh_tokens (id, user_id, token, expires_at, device_info) VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), userId, refreshToken, expiresAt, deviceInfo]
    );
  } finally {
    client.release();
  }
}

// Store user session
async function storeUserSession(userId, accessTokenHash, deviceInfo = null, ipAddress = null) {
  const client = await pool.connect();
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour

    await client.query(
      'INSERT INTO user_sessions (id, user_id, access_token_hash, expires_at, device_info, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [uuidv4(), userId, accessTokenHash, expiresAt, deviceInfo, ipAddress]
    );
  } finally {
    client.release();
  }
}

// Revoke refresh token
async function revokeRefreshToken(token) {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1',
      [token]
    );
  } finally {
    client.release();
  }
}

// Clean up expired tokens and sessions
async function cleanupExpiredTokens() {
  const client = await pool.connect();
  try {
    // Clean up expired refresh tokens
    await client.query(
      'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR is_revoked = TRUE'
    );

    // Clean up expired sessions
    await client.query(
      'DELETE FROM user_sessions WHERE expires_at < NOW()'
    );

    // Clean up expired verification codes
    await client.query(
      'DELETE FROM verification_codes WHERE expires_at < NOW()'
    );
  } finally {
    client.release();
  }
}

// Rate limiting for verification codes
function createVerificationLimiter() {
  const attempts = new Map();
  
  return (req, res, next) => {
    const phoneNumber = req.body.phoneNumber;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;

    if (!attempts.has(phoneNumber)) {
      attempts.set(phoneNumber, []);
    }

    const phoneAttempts = attempts.get(phoneNumber);
    const validAttempts = phoneAttempts.filter(timestamp => now - timestamp < windowMs);
    
    if (validAttempts.length >= maxAttempts) {
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: 'Too many verification attempts. Try again in 15 minutes.'
      });
    }

    validAttempts.push(now);
    attempts.set(phoneNumber, validAttempts);
    next();
  };
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  authenticateToken,
  storeRefreshToken,
  storeUserSession,
  revokeRefreshToken,
  cleanupExpiredTokens,
  createVerificationLimiter,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN
}; 