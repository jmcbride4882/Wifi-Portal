const database = require('../models/database');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Configure Winston logger for audit trails
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(__dirname, '../../logs/audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '365d', // Keep for 1 year as per security requirements
      createSymlink: true,
      symlinkName: 'audit-current.log'
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Log audit events to database and file
 * @param {Object} eventData - Audit event data
 * @param {string} eventData.user_type - Type of user (customer, staff, admin, system)
 * @param {number} [eventData.user_id] - User ID if applicable
 * @param {string} eventData.action - Action performed
 * @param {string} [eventData.resource] - Resource affected
 * @param {Object} [eventData.details] - Additional details
 * @param {string} [eventData.ip_address] - Client IP address
 * @param {string} [eventData.user_agent] - User agent string
 */
async function auditLog(eventData) {
  try {
    const auditEntry = {
      user_type: eventData.user_type,
      user_id: eventData.user_id || null,
      action: eventData.action,
      resource: eventData.resource || null,
      details: eventData.details ? JSON.stringify(eventData.details) : null,
      ip_address: eventData.ip_address || null,
      user_agent: eventData.user_agent || null,
      timestamp: new Date().toISOString()
    };

    // Log to database
    await database.run(`
      INSERT INTO audit_log 
      (user_type, user_id, action, resource, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      auditEntry.user_type,
      auditEntry.user_id,
      auditEntry.action,
      auditEntry.resource,
      auditEntry.details,
      auditEntry.ip_address,
      auditEntry.user_agent
    ]);

    // Log to file
    auditLogger.info('AUDIT', auditEntry);

    // Check for security alerts
    await checkSecurityAlerts(eventData);

  } catch (error) {
    console.error('Audit logging failed:', error);
    // Don't throw error to avoid breaking main functionality
  }
}

/**
 * Check for security alerts based on audit events
 */
async function checkSecurityAlerts(eventData) {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check for multiple failed login attempts
    if (eventData.action === 'login_failed' && eventData.ip_address) {
      const failedAttempts = await database.all(`
        SELECT COUNT(*) as count
        FROM audit_log 
        WHERE action = 'login_failed' 
        AND ip_address = ? 
        AND created_at > ?
      `, [eventData.ip_address, oneHourAgo.toISOString()]);

      if (failedAttempts[0].count >= 10) {
        await auditLog({
          user_type: 'system',
          action: 'security_alert',
          resource: 'authentication',
          details: {
            alert_type: 'brute_force_attempt',
            ip_address: eventData.ip_address,
            failed_attempts: failedAttempts[0].count
          }
        });

        // TODO: Send email alert to administrators
        console.warn(`SECURITY ALERT: Multiple failed login attempts from ${eventData.ip_address}`);
      }
    }

    // Check for voucher abuse
    if (eventData.action === 'voucher_redeemed' && eventData.user_id) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const recentRedemptions = await database.all(`
        SELECT COUNT(*) as count
        FROM audit_log 
        WHERE action = 'voucher_redeemed' 
        AND user_id = ? 
        AND created_at > ?
      `, [eventData.user_id, todayStart.toISOString()]);

      if (recentRedemptions[0].count >= 5) {
        await auditLog({
          user_type: 'system',
          action: 'security_alert',
          resource: 'vouchers',
          details: {
            alert_type: 'voucher_abuse',
            user_id: eventData.user_id,
            redemptions_today: recentRedemptions[0].count
          }
        });
      }
    }

  } catch (error) {
    console.error('Security alert check failed:', error);
  }
}

/**
 * Get audit log entries with filtering and pagination
 */
async function getAuditLog(filters = {}, page = 1, limit = 50) {
  try {
    const offset = (page - 1) * limit;
    let whereClause = '1=1';
    let params = [];

    // Build where clause based on filters
    if (filters.user_type) {
      whereClause += ' AND user_type = ?';
      params.push(filters.user_type);
    }

    if (filters.action) {
      whereClause += ' AND action = ?';
      params.push(filters.action);
    }

    if (filters.user_id) {
      whereClause += ' AND user_id = ?';
      params.push(filters.user_id);
    }

    if (filters.start_date) {
      whereClause += ' AND created_at >= ?';
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      whereClause += ' AND created_at <= ?';
      params.push(filters.end_date);
    }

    // Get total count
    const countResult = await database.get(
      `SELECT COUNT(*) as total FROM audit_log WHERE ${whereClause}`,
      params
    );

    // Get entries
    const entries = await database.all(`
      SELECT 
        id, user_type, user_id, action, resource, details, 
        ip_address, user_agent, created_at
      FROM audit_log 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    return {
      entries: entries.map(entry => ({
        ...entry,
        details: entry.details ? JSON.parse(entry.details) : null
      })),
      pagination: {
        page,
        limit,
        total: countResult.total,
        pages: Math.ceil(countResult.total / limit)
      }
    };

  } catch (error) {
    console.error('Get audit log failed:', error);
    throw error;
  }
}

/**
 * Generate security report
 */
async function generateSecurityReport(days = 30) {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const report = {
      period: { days, start_date: startDate.toISOString() },
      summary: {},
      alerts: [],
      top_actions: [],
      failed_logins: []
    };

    // Get summary statistics
    const summary = await database.all(`
      SELECT 
        action,
        COUNT(*) as count
      FROM audit_log 
      WHERE created_at >= ?
      GROUP BY action
      ORDER BY count DESC
    `, [startDate.toISOString()]);

    report.summary = summary.reduce((acc, item) => {
      acc[item.action] = item.count;
      return acc;
    }, {});

    // Get security alerts
    const alerts = await database.all(`
      SELECT *
      FROM audit_log 
      WHERE action = 'security_alert'
      AND created_at >= ?
      ORDER BY created_at DESC
    `, [startDate.toISOString()]);

    report.alerts = alerts.map(alert => ({
      ...alert,
      details: alert.details ? JSON.parse(alert.details) : null
    }));

    // Get failed login attempts by IP
    const failedLogins = await database.all(`
      SELECT 
        ip_address,
        COUNT(*) as attempts
      FROM audit_log 
      WHERE action = 'login_failed'
      AND created_at >= ?
      AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY attempts DESC
      LIMIT 10
    `, [startDate.toISOString()]);

    report.failed_logins = failedLogins;

    return report;

  } catch (error) {
    console.error('Generate security report failed:', error);
    throw error;
  }
}

/**
 * Clean old audit logs (beyond retention period)
 */
async function cleanOldAuditLogs() {
  try {
    const retentionDays = 365; // 1 year retention
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await database.run(`
      DELETE FROM audit_log 
      WHERE created_at < ?
    `, [cutoffDate.toISOString()]);

    console.log(`Cleaned ${result.changes} old audit log entries`);
    
    await auditLog({
      user_type: 'system',
      action: 'audit_cleanup',
      resource: 'audit_log',
      details: {
        deleted_entries: result.changes,
        cutoff_date: cutoffDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Clean old audit logs failed:', error);
  }
}

module.exports = {
  auditLog,
  getAuditLog,
  generateSecurityReport,
  cleanOldAuditLogs
};