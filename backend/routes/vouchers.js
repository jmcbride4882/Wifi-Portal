const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifyToken, requireManager } = require('../middleware/auth');
const database = require('../models/database');
const { auditLog } = require('../utils/audit');
const {
  redeemVoucher,
  getVoucherByCode,
  getUserVouchers,
  createPremiumWiFiVoucher,
  createStaffWiFiVoucher,
  getVoucherAnalytics
} = require('../utils/voucher');

const router = express.Router();

// Redeem voucher (staff only)
router.post('/redeem', 
  verifyToken,
  [
    body('voucherCode').isLength({ min: 5, max: 20 }).trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.staff) {
        return res.status(403).json({ error: 'Staff access required' });
      }

      const { voucherCode } = req.body;

      const redeemedVoucher = await redeemVoucher(voucherCode, req.staff);

      res.json({
        success: true,
        voucher: redeemedVoucher,
        message: 'Voucher redeemed successfully'
      });

    } catch (error) {
      console.error('Voucher redemption error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Voucher not found' });
      } else if (error.message.includes('already redeemed')) {
        return res.status(409).json({ error: 'Voucher already redeemed' });
      } else if (error.message.includes('expired')) {
        return res.status(410).json({ error: 'Voucher has expired' });
      } else if (error.message.includes('not active')) {
        return res.status(400).json({ error: 'Voucher is not active' });
      }
      
      res.status(500).json({ error: 'Failed to redeem voucher' });
    }
  }
);

// Get voucher details by code (staff only)
router.get('/lookup/:code', 
  verifyToken,
  async (req, res) => {
    try {
      if (!req.staff) {
        return res.status(403).json({ error: 'Staff access required' });
      }

      const { code } = req.params;
      const voucher = await getVoucherByCode(code);

      if (!voucher) {
        return res.status(404).json({ error: 'Voucher not found' });
      }

      // Check if voucher is expired
      const isExpired = new Date(voucher.expires_at) < new Date();
      
      res.json({
        success: true,
        voucher: {
          ...voucher,
          is_expired: isExpired,
          is_redeemed: voucher.status === 'redeemed'
        }
      });

    } catch (error) {
      console.error('Voucher lookup error:', error);
      res.status(500).json({ error: 'Failed to lookup voucher' });
    }
  }
);

// Create premium WiFi voucher (staff only)
router.post('/premium-wifi',
  verifyToken,
  [
    body('amountPaid').isFloat({ min: 0.01, max: 100 }),
    body('receiptBarcode').optional().isLength({ min: 5, max: 50 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.staff) {
        return res.status(403).json({ error: 'Staff access required' });
      }

      const { amountPaid, receiptBarcode } = req.body;

      const voucher = await createPremiumWiFiVoucher(req.staff.id, amountPaid);

      // Log the sale if receipt barcode provided
      if (receiptBarcode) {
        await auditLog({
          user_type: 'staff',
          user_id: req.staff.id,
          action: 'premium_wifi_sale',
          resource: 'vouchers',
          details: {
            voucher_id: voucher.id,
            amount_paid: amountPaid,
            receipt_barcode: receiptBarcode
          }
        });
      }

      res.status(201).json({
        success: true,
        voucher,
        message: 'Premium WiFi voucher created successfully'
      });

    } catch (error) {
      console.error('Premium WiFi voucher creation error:', error);
      res.status(500).json({ error: 'Failed to create premium WiFi voucher' });
    }
  }
);

// Create staff WiFi voucher (staff only)
router.post('/staff-wifi',
  verifyToken,
  async (req, res) => {
    try {
      if (!req.staff) {
        return res.status(403).json({ error: 'Staff access required' });
      }

      const voucher = await createStaffWiFiVoucher(req.staff.id);

      res.status(201).json({
        success: true,
        voucher,
        message: 'Staff WiFi voucher created successfully'
      });

    } catch (error) {
      console.error('Staff WiFi voucher creation error:', error);
      
      if (error.message.includes('already used')) {
        return res.status(409).json({ 
          error: 'Daily staff voucher already used. Manager override required.' 
        });
      }
      
      res.status(500).json({ error: 'Failed to create staff WiFi voucher' });
    }
  }
);

// Manager override for staff WiFi voucher
router.post('/staff-wifi/override',
  verifyToken,
  requireManager,
  [
    body('staffEmail').isEmail().normalizeEmail(),
    body('reason').isLength({ min: 5, max: 200 }).trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { staffEmail, reason } = req.body;

      // Get target staff member
      const targetStaff = await database.get('SELECT * FROM staff WHERE email = ?', [staffEmail]);
      if (!targetStaff) {
        return res.status(404).json({ error: 'Staff member not found' });
      }

      // Reset daily voucher flag
      await database.run(`
        UPDATE staff 
        SET daily_voucher_used = 0
        WHERE id = ?
      `, [targetStaff.id]);

      // Create voucher
      const voucher = await createStaffWiFiVoucher(targetStaff.id);

      await auditLog({
        user_type: 'staff',
        user_id: req.staff.id,
        action: 'staff_wifi_override',
        resource: 'vouchers',
        details: {
          target_staff_id: targetStaff.id,
          target_staff_email: staffEmail,
          voucher_id: voucher.id,
          reason
        }
      });

      res.status(201).json({
        success: true,
        voucher,
        message: 'Staff WiFi voucher override successful'
      });

    } catch (error) {
      console.error('Staff WiFi override error:', error);
      res.status(500).json({ error: 'Failed to override staff WiFi voucher' });
    }
  }
);

// Get user's vouchers (customer or staff viewing customer)
router.get('/user/:userId',
  verifyToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.query;

      // Check authorization
      if (req.customer && req.customer.id !== parseInt(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const vouchers = await getUserVouchers(parseInt(userId), status);

      res.json({
        success: true,
        vouchers
      });

    } catch (error) {
      console.error('Get user vouchers error:', error);
      res.status(500).json({ error: 'Failed to retrieve vouchers' });
    }
  }
);

// Get voucher analytics (manager/admin only)
router.get('/analytics',
  verifyToken,
  requireManager,
  async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const siteId = req.staff.site_id;

      const analytics = await getVoucherAnalytics(siteId, parseInt(days));

      res.json({
        success: true,
        analytics
      });

    } catch (error) {
      console.error('Voucher analytics error:', error);
      res.status(500).json({ error: 'Failed to retrieve analytics' });
    }
  }
);

// Get all vouchers with filters (manager/admin only)
router.get('/',
  verifyToken,
  requireManager,
  async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        status, 
        type, 
        user_id,
        start_date,
        end_date 
      } = req.query;

      const offset = (page - 1) * limit;
      let whereClause = 'site_id = ?';
      let params = [req.staff.site_id];

      // Build filters
      if (status) {
        whereClause += ' AND status = ?';
        params.push(status);
      }

      if (type) {
        whereClause += ' AND type = ?';
        params.push(type);
      }

      if (user_id) {
        whereClause += ' AND user_id = ?';
        params.push(user_id);
      }

      if (start_date) {
        whereClause += ' AND created_at >= ?';
        params.push(start_date);
      }

      if (end_date) {
        whereClause += ' AND created_at <= ?';
        params.push(end_date);
      }

      // Get total count
      const countResult = await database.get(
        `SELECT COUNT(*) as total FROM vouchers WHERE ${whereClause}`,
        params
      );

      // Get vouchers
      const vouchers = await database.all(`
        SELECT 
          v.*,
          u.name as user_name,
          u.email as user_email,
          s.name as redeemed_by_name
        FROM vouchers v
        LEFT JOIN users u ON v.user_id = u.id
        LEFT JOIN staff s ON v.redeemed_by = s.id
        WHERE ${whereClause}
        ORDER BY v.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      res.json({
        success: true,
        vouchers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.total,
          pages: Math.ceil(countResult.total / limit)
        }
      });

    } catch (error) {
      console.error('Get vouchers error:', error);
      res.status(500).json({ error: 'Failed to retrieve vouchers' });
    }
  }
);

// Update voucher status (admin only)
router.patch('/:id/status',
  verifyToken,
  requireManager,
  [
    body('status').isIn(['active', 'expired', 'cancelled']),
    body('reason').optional().isLength({ min: 5, max: 200 }).trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { status, reason } = req.body;

      // Get current voucher
      const voucher = await database.get('SELECT * FROM vouchers WHERE id = ?', [id]);
      if (!voucher) {
        return res.status(404).json({ error: 'Voucher not found' });
      }

      // Can't change status of already redeemed vouchers
      if (voucher.status === 'redeemed') {
        return res.status(400).json({ error: 'Cannot change status of redeemed voucher' });
      }

      // Update status
      await database.run(`
        UPDATE vouchers 
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [status, id]);

      await auditLog({
        user_type: 'staff',
        user_id: req.staff.id,
        action: 'voucher_status_changed',
        resource: 'vouchers',
        details: {
          voucher_id: parseInt(id),
          old_status: voucher.status,
          new_status: status,
          reason
        }
      });

      res.json({
        success: true,
        message: `Voucher status changed to ${status}`
      });

    } catch (error) {
      console.error('Update voucher status error:', error);
      res.status(500).json({ error: 'Failed to update voucher status' });
    }
  }
);

module.exports = router;