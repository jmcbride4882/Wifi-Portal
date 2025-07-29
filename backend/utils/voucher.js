const QRCode = require('qrcode');
const JsBarcode = require('jsbarcode');
const { createCanvas } = require('canvas');
const crypto = require('crypto');
const database = require('../models/database');
const { auditLog } = require('./audit');

/**
 * Generate unique voucher code
 */
function generateVoucherCode(type = 'reward', length = 12) {
  const prefix = type.substring(0, 2).toUpperCase();
  const randomPart = crypto.randomBytes(length / 2).toString('hex').toUpperCase();
  return `${prefix}${randomPart}`;
}

/**
 * Generate QR code for voucher
 */
async function generateQRCode(voucherData) {
  try {
    const qrData = JSON.stringify({
      code: voucherData.code,
      type: voucherData.type,
      title: voucherData.title,
      value: voucherData.value,
      expires: voucherData.expires_at,
      site: voucherData.site_id
    });

    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    });

    return qrCodeDataURL;
  } catch (error) {
    console.error('QR code generation failed:', error);
    throw error;
  }
}

/**
 * Generate barcode for voucher
 */
function generateBarcode(code) {
  try {
    const canvas = createCanvas(200, 50);
    JsBarcode(canvas, code, {
      format: "CODE128",
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 12,
      margin: 10
    });

    return canvas.toDataURL();
  } catch (error) {
    console.error('Barcode generation failed:', error);
    throw error;
  }
}

/**
 * Create a new voucher
 */
async function createVoucher(voucherData) {
  try {
    const {
      user_id,
      site_id,
      type,
      title,
      description,
      value,
      expires_in_hours = 72,
      created_by
    } = voucherData;

    // Generate unique code
    const code = generateVoucherCode(type);
    
    // Set expiration
    const expires_at = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);

    // Create voucher object
    const voucher = {
      user_id,
      site_id,
      code,
      type,
      title,
      description,
      value,
      expires_at: expires_at.toISOString(),
      status: 'active'
    };

    // Generate QR code and barcode
    voucher.qr_code = await generateQRCode(voucher);
    voucher.barcode = generateBarcode(code);

    // Insert into database
    const result = await database.run(`
      INSERT INTO vouchers 
      (user_id, site_id, code, type, title, description, value, qr_code, barcode, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      voucher.user_id,
      voucher.site_id,
      voucher.code,
      voucher.type,
      voucher.title,
      voucher.description,
      voucher.value,
      voucher.qr_code,
      voucher.barcode,
      voucher.expires_at,
      voucher.status
    ]);

    voucher.id = result.id;

    // Log creation
    await auditLog({
      user_type: created_by?.type || 'system',
      user_id: created_by?.id || null,
      action: 'voucher_created',
      resource: 'vouchers',
      details: {
        voucher_id: voucher.id,
        voucher_code: voucher.code,
        type: voucher.type,
        value: voucher.value,
        recipient_user_id: user_id
      }
    });

    return voucher;

  } catch (error) {
    console.error('Create voucher failed:', error);
    throw error;
  }
}

/**
 * Verify and redeem voucher
 */
async function redeemVoucher(code, redeemed_by) {
  try {
    // Get voucher
    const voucher = await database.get(`
      SELECT v.*, u.name as user_name, u.email as user_email
      FROM vouchers v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.code = ?
    `, [code]);

    if (!voucher) {
      throw new Error('Voucher not found');
    }

    // Check if already redeemed
    if (voucher.status === 'redeemed') {
      throw new Error('Voucher already redeemed');
    }

    // Check if expired
    if (new Date(voucher.expires_at) < new Date()) {
      throw new Error('Voucher expired');
    }

    // Check if active
    if (voucher.status !== 'active') {
      throw new Error('Voucher not active');
    }

    // Mark as redeemed
    await database.run(`
      UPDATE vouchers 
      SET status = 'redeemed', redeemed_at = datetime('now'), redeemed_by = ?
      WHERE id = ?
    `, [redeemed_by.id, voucher.id]);

    // Update user loyalty if applicable
    if (voucher.user_id && voucher.type === 'loyalty_reward') {
      await updateUserLoyalty(voucher.user_id, 'redemption');
    }

    // Log redemption
    await auditLog({
      user_type: 'staff',
      user_id: redeemed_by.id,
      action: 'voucher_redeemed',
      resource: 'vouchers',
      details: {
        voucher_id: voucher.id,
        voucher_code: voucher.code,
        type: voucher.type,
        value: voucher.value,
        customer_user_id: voucher.user_id
      }
    });

    return {
      ...voucher,
      status: 'redeemed',
      redeemed_at: new Date().toISOString(),
      redeemed_by: redeemed_by.id
    };

  } catch (error) {
    console.error('Redeem voucher failed:', error);
    throw error;
  }
}

/**
 * Get voucher by code
 */
async function getVoucherByCode(code) {
  try {
    const voucher = await database.get(`
      SELECT v.*, u.name as user_name, u.email as user_email,
             s.name as redeemed_by_name
      FROM vouchers v
      LEFT JOIN users u ON v.user_id = u.id
      LEFT JOIN staff s ON v.redeemed_by = s.id
      WHERE v.code = ?
    `, [code]);

    return voucher;
  } catch (error) {
    console.error('Get voucher failed:', error);
    throw error;
  }
}

/**
 * Get user vouchers
 */
async function getUserVouchers(user_id, status = null) {
  try {
    let query = `
      SELECT * FROM vouchers 
      WHERE user_id = ?
    `;
    let params = [user_id];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const vouchers = await database.all(query, params);
    return vouchers;
  } catch (error) {
    console.error('Get user vouchers failed:', error);
    throw error;
  }
}

/**
 * Create loyalty reward voucher
 */
async function createLoyaltyReward(user_id, tier, visits) {
  try {
    const rewards = {
      bronze: { title: 'Welcome Reward', description: 'Free drink', value: 5.00 },
      silver: { title: 'Silver Member Reward', description: 'Free appetizer', value: 8.00 },
      gold: { title: 'Gold Member Reward', description: 'Free meal', value: 15.00 },
      platinum: { title: 'Platinum Patron', description: 'Free dinner for two', value: 30.00 }
    };

    const reward = rewards[tier.toLowerCase()];
    if (!reward) {
      throw new Error('Invalid loyalty tier');
    }

    // Get user's site
    const user = await database.get('SELECT site_id FROM users WHERE id = ?', [user_id]);
    
    const voucher = await createVoucher({
      user_id,
      site_id: user.site_id,
      type: 'loyalty_reward',
      title: reward.title,
      description: reward.description,
      value: reward.value,
      expires_in_hours: 168, // 1 week
      created_by: { type: 'system' }
    });

    return voucher;
  } catch (error) {
    console.error('Create loyalty reward failed:', error);
    throw error;
  }
}

/**
 * Create premium WiFi voucher
 */
async function createPremiumWiFiVoucher(staff_id, amount_paid) {
  try {
    // Get staff info
    const staff = await database.get('SELECT site_id FROM staff WHERE id = ?', [staff_id]);
    
    const voucher = await createVoucher({
      user_id: null, // Not tied to specific user
      site_id: staff.site_id,
      type: 'premium_wifi',
      title: 'Premium WiFi Access',
      description: 'Unlimited high-speed WiFi for 24 hours',
      value: amount_paid,
      expires_in_hours: 48,
      created_by: { type: 'staff', id: staff_id }
    });

    return voucher;
  } catch (error) {
    console.error('Create premium WiFi voucher failed:', error);
    throw error;
  }
}

/**
 * Create staff WiFi voucher
 */
async function createStaffWiFiVoucher(staff_id) {
  try {
    const staff = await database.get('SELECT * FROM staff WHERE id = ?', [staff_id]);
    
    // Check if already used daily voucher
    const today = new Date().toISOString().split('T')[0];
    if (staff.last_voucher_date === today && staff.daily_voucher_used) {
      throw new Error('Daily staff voucher already used');
    }

    const voucher = await createVoucher({
      user_id: null,
      site_id: staff.site_id,
      type: 'staff_wifi',
      title: 'Staff WiFi Access',
      description: 'Staff internet access for work device',
      value: 0,
      expires_in_hours: 24,
      created_by: { type: 'staff', id: staff_id }
    });

    // Mark daily voucher as used
    await database.run(`
      UPDATE staff 
      SET daily_voucher_used = 1, last_voucher_date = ?
      WHERE id = ?
    `, [today, staff_id]);

    return voucher;
  } catch (error) {
    console.error('Create staff WiFi voucher failed:', error);
    throw error;
  }
}

/**
 * Update user loyalty on visit/redemption
 */
async function updateUserLoyalty(user_id, action = 'visit') {
  try {
    const user = await database.get('SELECT * FROM users WHERE id = ?', [user_id]);
    if (!user) return;

    let newVisitCount = user.visit_count;
    if (action === 'visit') {
      newVisitCount += 1;
    }

    // Determine new tier
    let newTier = 'Bronze';
    if (newVisitCount >= 30) newTier = 'Platinum';
    else if (newVisitCount >= 15) newTier = 'Gold';
    else if (newVisitCount >= 5) newTier = 'Silver';

    // Check if tier changed
    const tierChanged = newTier !== user.loyalty_tier;

    // Update user
    await database.run(`
      UPDATE users 
      SET visit_count = ?, loyalty_tier = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [newVisitCount, newTier, user_id]);

    // Create loyalty reward if tier increased
    if (tierChanged && action === 'visit') {
      await createLoyaltyReward(user_id, newTier, newVisitCount);
    }

    return { 
      visit_count: newVisitCount, 
      loyalty_tier: newTier, 
      tier_changed: tierChanged 
    };

  } catch (error) {
    console.error('Update user loyalty failed:', error);
    throw error;
  }
}

/**
 * Get voucher analytics
 */
async function getVoucherAnalytics(site_id, days = 30) {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const analytics = {
      total_created: 0,
      total_redeemed: 0,
      total_expired: 0,
      redemption_rate: 0,
      by_type: {},
      by_day: []
    };

    // Get summary counts
    const summary = await database.all(`
      SELECT 
        type,
        status,
        COUNT(*) as count
      FROM vouchers 
      WHERE site_id = ? AND created_at >= ?
      GROUP BY type, status
    `, [site_id, startDate.toISOString()]);

    // Process summary
    for (const row of summary) {
      if (!analytics.by_type[row.type]) {
        analytics.by_type[row.type] = { created: 0, redeemed: 0, expired: 0 };
      }
      analytics.by_type[row.type][row.status] = row.count;
      analytics.total_created += row.count;
      if (row.status === 'redeemed') analytics.total_redeemed += row.count;
      if (row.status === 'expired') analytics.total_expired += row.count;
    }

    // Calculate redemption rate
    if (analytics.total_created > 0) {
      analytics.redemption_rate = (analytics.total_redeemed / analytics.total_created * 100).toFixed(2);
    }

    return analytics;

  } catch (error) {
    console.error('Get voucher analytics failed:', error);
    throw error;
  }
}

module.exports = {
  generateVoucherCode,
  generateQRCode,
  generateBarcode,
  createVoucher,
  redeemVoucher,
  getVoucherByCode,
  getUserVouchers,
  createLoyaltyReward,
  createPremiumWiFiVoucher,
  createStaffWiFiVoucher,
  updateUserLoyalty,
  getVoucherAnalytics
};