const express = require('express');
const { v4: uuidv4 } = require('uuid');
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

// Create person card
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, context, timestamp, location, isDiscoverable } = req.body;
    const { userId } = req.user;

    // Validate input
    if (!name || !timestamp) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: 'Name and timestamp are required'
      });
    }

    const cardId = uuidv4();

    // Insert person card
    await pool.query(
      `INSERT INTO person_cards (id, user_id, name, context, timestamp, latitude, longitude, geohash, is_discoverable) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        cardId,
        userId,
        name,
        context,
        timestamp,
        location?.latitude,
        location?.longitude,
        location?.geohash,
        isDiscoverable || false
      ]
    );

    res.json({
      success: true,
      personCard: {
        id: cardId,
        name,
        context,
        timestamp,
        location,
        isDiscoverable: isDiscoverable || false,
        createdAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Create person card error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Get person cards
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { limit = 50, offset = 0, discoverable } = req.query;

    let query = 'SELECT * FROM person_cards WHERE user_id = $1';
    let params = [userId];

    if (discoverable !== undefined) {
      query += ' AND is_discoverable = $2';
      params.push(discoverable === 'true');
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    const personCards = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      context: row.context,
      timestamp: row.timestamp,
      location: {
        latitude: row.latitude,
        longitude: row.longitude,
        geohash: row.geohash
      },
      isDiscoverable: row.is_discoverable,
      createdAt: row.created_at
    }));

    res.json({
      success: true,
      personCards,
      total: personCards.length,
      hasMore: personCards.length === parseInt(limit)
    });

  } catch (error) {
    console.error('Get person cards error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Update person card
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, context, isDiscoverable } = req.body;
    const { userId } = req.user;

    // Check if person card exists and belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM person_cards WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'CARD_NOT_FOUND',
        message: 'Person card not found'
      });
    }

    // Update person card
    await pool.query(
      'UPDATE person_cards SET name = $1, context = $2, is_discoverable = $3 WHERE id = $4',
      [name, context, isDiscoverable, id]
    );

    res.json({
      success: true,
      message: 'Person card updated successfully'
    });

  } catch (error) {
    console.error('Update person card error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Delete person card
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    // Check if person card exists and belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM person_cards WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'CARD_NOT_FOUND',
        message: 'Person card not found'
      });
    }

    // Delete person card
    await pool.query('DELETE FROM person_cards WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Person card deleted successfully'
    });

  } catch (error) {
    console.error('Delete person card error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

// Toggle discoverability
router.post('/:id/discoverable', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isDiscoverable } = req.body;
    const { userId } = req.user;

    // Check if person card exists and belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM person_cards WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'CARD_NOT_FOUND',
        message: 'Person card not found'
      });
    }

    // Update discoverability
    await pool.query(
      'UPDATE person_cards SET is_discoverable = $1 WHERE id = $2',
      [isDiscoverable, id]
    );

    res.json({
      success: true,
      message: 'Discoverability updated successfully'
    });

  } catch (error) {
    console.error('Toggle discoverability error:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong'
    });
  }
});

module.exports = router; 