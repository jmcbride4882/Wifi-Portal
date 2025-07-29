const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { 
  authenticateStaff, 
  authenticateCustomer, 
  generateToken,
  extractDeviceMAC 
} = require('../middleware/auth');
const database = require('../models/database');
const { auditLog } = require('../utils/audit');

const router = express.Router();

// Staff login
router.post('/staff/login', 
  extractDeviceMAC,
  [
    body('email').isEmail().normalizeEmail(),
    body('pin').isLength({ min: 4, max: 10 }).isNumeric()
  ],
  authenticateStaff,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      res.json({
        success: true,
        token: req.token,
        staff: {
          id: req.staff.id,
          email: req.staff.email,
          name: req.staff.name,
          role: req.staff.role,
          site_id: req.staff.site_id
        },
        message: 'Login successful'
      });
    } catch (error) {
      console.error('Staff login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Customer login
router.post('/customer/login',
  extractDeviceMAC,
  [
    body('email').isEmail().normalizeEmail(),
    body('dateOfBirth').isISO8601().toDate()
  ],
  authenticateCustomer,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get user's loyalty info and vouchers
      const loyaltyInfo = await database.get(`
        SELECT visit_count, loyalty_tier, loyalty_points
        FROM users WHERE id = ?
      `, [req.customer.id]);

      const activeVouchers = await database.all(`
        SELECT id, code, type, title, description, value, expires_at, qr_code
        FROM vouchers 
        WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
        ORDER BY created_at DESC
      `, [req.customer.id]);

      res.json({
        success: true,
        token: req.token,
        customer: {
          id: req.customer.id,
          email: req.customer.email,
          name: req.customer.name,
          loyalty_tier: loyaltyInfo?.loyalty_tier || 'Bronze',
          visit_count: loyaltyInfo?.visit_count || 0,
          loyalty_points: loyaltyInfo?.loyalty_points || 0
        },
        vouchers: activeVouchers,
        message: 'Login successful'
      });
    } catch (error) {
      console.error('Customer login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Customer signup
router.post('/customer/signup',
  extractDeviceMAC,
  [
    body('email').isEmail().normalizeEmail(),
    body('name').isLength({ min: 2, max: 100 }).trim(),
    body('dateOfBirth').isISO8601().toDate(),
    body('marketingConsent').isBoolean(),
    body('phone').optional().isMobilePhone()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, name, dateOfBirth, marketingConsent, phone } = req.body;
      const clientIP = req.ip || req.connection.remoteAddress;

      // Check if user already exists
      const existingUser = await database.get('SELECT id FROM users WHERE email = ?', [email]);
      if (existingUser) {
        return res.status(409).json({ 
          error: 'Email already registered. Please use the login option.' 
        });
      }

      // Check device limit for new users (anti-abuse)
      if (req.deviceMAC) {
        const deviceCount = await database.get(`
          SELECT COUNT(*) as count 
          FROM devices 
          WHERE mac_address = ? AND status = 'active'
        `, [req.deviceMAC]);

        if (deviceCount.count >= 3) {
          await auditLog({
            user_type: 'customer',
            action: 'signup_blocked',
            resource: 'registration',
            details: { 
              reason: 'device_limit_exceeded',
              mac_address: req.deviceMAC,
              email
            },
            ip_address: clientIP
          });
          
          return res.status(429).json({ 
            error: 'Device limit exceeded. Please contact support.' 
          });
        }
      }

      // Create user
      const userResult = await database.run(`
        INSERT INTO users (site_id, email, name, date_of_birth, phone, marketing_consent, visit_count, loyalty_tier)
        VALUES (1, ?, ?, ?, ?, ?, 1, 'Bronze')
      `, [email, name, dateOfBirth, phone, marketingConsent ? 1 : 0]);

      const userId = userResult.id;

      // Register device if MAC provided
      if (req.deviceMAC) {
        await database.run(`
          INSERT INTO devices (user_id, mac_address, device_type, status)
          VALUES (?, ?, 'mobile', 'active')
        `, [userId, req.deviceMAC]);
      }

      // Create welcome voucher if marketing consent given
      let welcomeVoucher = null;
      if (marketingConsent) {
        const { createLoyaltyReward } = require('../utils/voucher');
        welcomeVoucher = await createLoyaltyReward(userId, 'Bronze', 1);
      }

      // Generate token
      const token = generateToken({
        id: userId,
        email: email,
        site_id: 1,
        type: 'customer'
      });

      await auditLog({
        user_type: 'customer',
        user_id: userId,
        action: 'signup_success',
        resource: 'registration',
        details: { 
          marketing_consent: marketingConsent,
          has_welcome_voucher: !!welcomeVoucher
        },
        ip_address: clientIP
      });

      res.status(201).json({
        success: true,
        token,
        customer: {
          id: userId,
          email,
          name,
          loyalty_tier: 'Bronze',
          visit_count: 1,
          loyalty_points: 0
        },
        welcomeVoucher,
        message: 'Account created successfully!'
      });

    } catch (error) {
      console.error('Customer signup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Change staff PIN
router.post('/staff/change-pin',
  [
    body('currentPin').isLength({ min: 4, max: 10 }).isNumeric(),
    body('newPin').isLength({ min: 4, max: 10 }).isNumeric(),
    body('email').isEmail().normalizeEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, currentPin, newPin } = req.body;
      const clientIP = req.ip || req.connection.remoteAddress;

      // Get staff member
      const staff = await database.get('SELECT * FROM staff WHERE email = ?', [email]);
      if (!staff) {
        return res.status(404).json({ error: 'Staff member not found' });
      }

      // Verify current PIN
      const currentPinValid = await bcrypt.compare(currentPin, staff.pin_hash);
      if (!currentPinValid) {
        await auditLog({
          user_type: 'staff',
          user_id: staff.id,
          action: 'pin_change_failed',
          resource: 'authentication',
          details: { reason: 'invalid_current_pin' },
          ip_address: clientIP
        });
        return res.status(401).json({ error: 'Current PIN is incorrect' });
      }

      // Hash new PIN
      const newPinHash = await bcrypt.hash(newPin, 10);

      // Update PIN
      await database.run(
        'UPDATE staff SET pin_hash = ?, updated_at = datetime("now") WHERE id = ?',
        [newPinHash, staff.id]
      );

      await auditLog({
        user_type: 'staff',
        user_id: staff.id,
        action: 'pin_changed',
        resource: 'authentication',
        details: {},
        ip_address: clientIP
      });

      res.json({
        success: true,
        message: 'PIN changed successfully'
      });

    } catch (error) {
      console.error('Change PIN error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Logout (invalidate session)
router.post('/logout', async (req, res) => {
  try {
    // In a stateless JWT setup, logout is mainly client-side
    // But we can log the action for audit purposes
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      // Could implement token blacklisting here if needed
      await auditLog({
        user_type: 'unknown',
        action: 'logout',
        resource: 'authentication',
        details: { token_invalidated: true },
        ip_address: req.ip
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check authentication status
router.get('/status', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.json({ authenticated: false });
    }

    // This could be expanded to verify token and return user info
    res.json({ 
      authenticated: true,
      message: 'Token present'
    });
  } catch (error) {
    res.json({ authenticated: false });
  }
});

module.exports = router;