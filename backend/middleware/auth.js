const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const database = require('../models/database');
const { auditLog } = require('../utils/audit');

const JWT_SECRET = process.env.JWT_SECRET || 'lslt-portal-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Verify JWT token middleware
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    
    // Check if user still exists and is active
    if (decoded.type === 'staff') {
      const staff = await database.get(
        'SELECT * FROM staff WHERE id = ? AND (locked_until IS NULL OR locked_until < datetime("now"))',
        [decoded.id]
      );
      
      if (!staff) {
        return res.status(401).json({ error: 'Invalid token or account locked.' });
      }
      
      req.staff = staff;
    } else if (decoded.type === 'customer') {
      const user = await database.get('SELECT * FROM users WHERE id = ?', [decoded.id]);
      if (!user) {
        return res.status(401).json({ error: 'Invalid token.' });
      }
      req.customer = user;
    }
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// Staff authentication with PIN
const authenticateStaff = async (req, res, next) => {
  try {
    const { email, pin } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    if (!email || !pin) {
      return res.status(400).json({ error: 'Email and PIN are required.' });
    }

    // Get staff member
    const staff = await database.get('SELECT * FROM staff WHERE email = ?', [email]);
    
    if (!staff) {
      await auditLog({
        user_type: 'staff',
        action: 'login_failed',
        resource: 'authentication',
        details: { reason: 'user_not_found', email },
        ip_address: clientIP,
        user_agent: userAgent
      });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Check if account is locked
    if (staff.locked_until && new Date(staff.locked_until) > new Date()) {
      await auditLog({
        user_type: 'staff',
        user_id: staff.id,
        action: 'login_failed',
        resource: 'authentication',
        details: { reason: 'account_locked' },
        ip_address: clientIP,
        user_agent: userAgent
      });
      return res.status(423).json({ 
        error: 'Account temporarily locked due to failed attempts.',
        locked_until: staff.locked_until
      });
    }

    // Verify PIN
    const pinValid = await bcrypt.compare(pin, staff.pin_hash);
    
    if (!pinValid) {
      // Increment failed attempts
      const newFailedAttempts = staff.failed_attempts + 1;
      let updateData = { failed_attempts: newFailedAttempts };
      
      // Lock account after 3 failed attempts
      if (newFailedAttempts >= 3) {
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        updateData.locked_until = lockUntil.toISOString();
        
        // TODO: Block device via UDM API
        await blockDeviceByMAC(req.deviceMAC);
      }
      
      await database.run(
        'UPDATE staff SET failed_attempts = ?, locked_until = ? WHERE id = ?',
        [updateData.failed_attempts, updateData.locked_until || null, staff.id]
      );

      await auditLog({
        user_type: 'staff',
        user_id: staff.id,
        action: 'login_failed',
        resource: 'authentication',
        details: { 
          reason: 'invalid_pin', 
          failed_attempts: newFailedAttempts,
          locked: newFailedAttempts >= 3
        },
        ip_address: clientIP,
        user_agent: userAgent
      });

      if (newFailedAttempts >= 3) {
        return res.status(423).json({ 
          error: 'Account locked due to multiple failed attempts. Contact administrator.',
          locked_until: updateData.locked_until
        });
      }

      return res.status(401).json({ 
        error: 'Invalid credentials.',
        attempts_remaining: 3 - newFailedAttempts
      });
    }

    // Reset failed attempts on successful login
    await database.run(
      'UPDATE staff SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
      [staff.id]
    );

    // Generate token
    const token = generateToken({
      id: staff.id,
      email: staff.email,
      role: staff.role,
      site_id: staff.site_id,
      type: 'staff'
    });

    await auditLog({
      user_type: 'staff',
      user_id: staff.id,
      action: 'login_success',
      resource: 'authentication',
      details: { role: staff.role },
      ip_address: clientIP,
      user_agent: userAgent
    });

    req.staff = staff;
    req.token = token;
    next();
    
  } catch (error) {
    console.error('Staff authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed.' });
  }
};

// Admin role check
const requireAdmin = (req, res, next) => {
  if (!req.staff || (req.staff.role !== 'admin' && req.staff.role !== 'manager')) {
    return res.status(403).json({ error: 'Administrative privileges required.' });
  }
  next();
};

// Manager or admin role check
const requireManager = (req, res, next) => {
  if (!req.staff || !['admin', 'manager'].includes(req.staff.role)) {
    return res.status(403).json({ error: 'Management privileges required.' });
  }
  next();
};

// Customer authentication
const authenticateCustomer = async (req, res, next) => {
  try {
    const { email, dateOfBirth } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!email || !dateOfBirth) {
      return res.status(400).json({ error: 'Email and date of birth are required.' });
    }

    // Get customer
    const customer = await database.get(
      'SELECT * FROM users WHERE email = ? AND date_of_birth = ?',
      [email, dateOfBirth]
    );

    if (!customer) {
      await auditLog({
        user_type: 'customer',
        action: 'login_failed',
        resource: 'authentication',
        details: { reason: 'invalid_credentials', email },
        ip_address: clientIP
      });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Generate token
    const token = generateToken({
      id: customer.id,
      email: customer.email,
      site_id: customer.site_id,
      type: 'customer'
    });

    await auditLog({
      user_type: 'customer',
      user_id: customer.id,
      action: 'login_success',
      resource: 'authentication',
      details: {},
      ip_address: clientIP
    });

    req.customer = customer;
    req.token = token;
    next();
    
  } catch (error) {
    console.error('Customer authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed.' });
  }
};

// Device MAC extraction middleware
const extractDeviceMAC = (req, res, next) => {
  // In a real captive portal, this would extract MAC from network headers
  // For demo purposes, we'll use a header or parameter
  req.deviceMAC = req.header('X-Device-MAC') || req.body.deviceMAC || req.query.mac;
  next();
};

// Placeholder for UDM device blocking
async function blockDeviceByMAC(macAddress) {
  if (!macAddress) return;
  
  try {
    console.log(`Blocking device with MAC: ${macAddress}`);
    // TODO: Implement actual UDM API call
    // This would call the Python microservice for UDM integration
    
    // For now, just log the action
    await auditLog({
      user_type: 'system',
      action: 'device_blocked',
      resource: 'network',
      details: { mac_address: macAddress, reason: 'failed_staff_login' }
    });
  } catch (error) {
    console.error('Failed to block device:', error);
  }
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateStaff,
  authenticateCustomer,
  requireAdmin,
  requireManager,
  extractDeviceMAC,
  blockDeviceByMAC
};