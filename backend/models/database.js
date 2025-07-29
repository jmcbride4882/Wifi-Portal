const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

class Database {
  constructor() {
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, '../../config/lslt_portal.db');
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          resolve();
        }
      });
    });
  }

  async createTables() {
    const tables = [
      // Sites table for multi-location support
      `CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        timezone TEXT DEFAULT 'America/New_York',
        settings JSON DEFAULT '{}',
        branding JSON DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Users table for customer accounts
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        date_of_birth DATE,
        phone TEXT,
        marketing_consent BOOLEAN DEFAULT 0,
        visit_count INTEGER DEFAULT 0,
        loyalty_tier TEXT DEFAULT 'Bronze',
        loyalty_points INTEGER DEFAULT 0,
        family_group_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id),
        FOREIGN KEY (family_group_id) REFERENCES family_groups(id)
      )`,

      // Devices table for MAC tracking and limits
      `CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        mac_address TEXT NOT NULL,
        device_name TEXT,
        device_type TEXT,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        data_usage INTEGER DEFAULT 0,
        blocked BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // Staff table for employee management
      `CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        role TEXT DEFAULT 'staff',
        device_limit INTEGER DEFAULT 1,
        daily_voucher_used BOOLEAN DEFAULT 0,
        last_voucher_date DATE,
        failed_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id)
      )`,

      // Visits table for tracking customer interactions
      `CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        site_id INTEGER,
        device_id INTEGER,
        visit_type TEXT DEFAULT 'wifi',
        session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
        session_end DATETIME,
        data_used INTEGER DEFAULT 0,
        voucher_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (site_id) REFERENCES sites(id),
        FOREIGN KEY (device_id) REFERENCES devices(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
      )`,

      // Vouchers table for rewards and promotions
      `CREATE TABLE IF NOT EXISTS vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        site_id INTEGER,
        code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        value DECIMAL(10,2),
        qr_code TEXT,
        barcode TEXT,
        status TEXT DEFAULT 'active',
        expires_at DATETIME,
        redeemed_at DATETIME,
        redeemed_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (site_id) REFERENCES sites(id),
        FOREIGN KEY (redeemed_by) REFERENCES staff(id)
      )`,

      // Rewards table for loyalty program
      `CREATE TABLE IF NOT EXISTS rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        name TEXT NOT NULL,
        description TEXT,
        tier_required TEXT,
        visits_required INTEGER,
        points_required INTEGER,
        reward_type TEXT,
        reward_value DECIMAL(10,2),
        active BOOLEAN DEFAULT 1,
        bilingual_name JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id)
      )`,

      // Family groups for family rewards
      `CREATE TABLE IF NOT EXISTS family_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        primary_user_id INTEGER,
        group_points INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (primary_user_id) REFERENCES users(id)
      )`,

      // Printers configuration
      `CREATE TABLE IF NOT EXISTS printers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        port INTEGER DEFAULT 9100,
        status TEXT DEFAULT 'online',
        is_default BOOLEAN DEFAULT 0,
        settings JSON DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id)
      )`,

      // Marketing campaigns
      `CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        target_segment JSON,
        content JSON,
        schedule_type TEXT DEFAULT 'immediate',
        scheduled_at DATETIME,
        status TEXT DEFAULT 'draft',
        sent_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id)
      )`,

      // Audit log for security and compliance
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_type TEXT NOT NULL,
        user_id INTEGER,
        action TEXT NOT NULL,
        resource TEXT,
        details JSON,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // System settings
      `CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        type TEXT DEFAULT 'string',
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // WiFi sessions for tracking active connections
      `CREATE TABLE IF NOT EXISTS wifi_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER,
        user_id INTEGER,
        mac_address TEXT NOT NULL,
        ip_address TEXT,
        session_token TEXT,
        data_limit INTEGER DEFAULT 750,
        data_used INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        ended_at DATETIME,
        FOREIGN KEY (device_id) REFERENCES devices(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }

    console.log('Database tables created successfully');
  }

  async insertDefaultData() {
    // Insert default site
    const defaultSite = await this.get('SELECT id FROM sites WHERE name = ?', ['Default Site']);
    if (!defaultSite) {
      await this.run(`
        INSERT INTO sites (name, location, settings, branding)
        VALUES (?, ?, ?, ?)
      `, [
        'Default Site',
        'Main Location',
        JSON.stringify({
          device_limit_per_user: 2,
          data_limit_mb: 750,
          loyalty_tiers: {
            bronze: { visits: 0, name: { en: 'Bronze', es: 'Bronce' } },
            silver: { visits: 5, name: { en: 'Silver', es: 'Plata' } },
            gold: { visits: 15, name: { en: 'Gold', es: 'Oro' } },
            platinum: { visits: 30, name: { en: 'Platinum', es: 'Platino' } }
          }
        }),
        JSON.stringify({
          logo_url: '',
          primary_color: '#3B82F6',
          secondary_color: '#1E40AF',
          company_name: 'LSLT Portal',
          wifi_ssid: 'Guest_WiFi'
        })
      ]);
    }

    // Insert default admin user
    const defaultAdmin = await this.get('SELECT id FROM staff WHERE email = ?', ['admin@lslt.local']);
    if (!defaultAdmin) {
      const adminPinHash = await bcrypt.hash('280493', 10);
      await this.run(`
        INSERT INTO staff (site_id, email, name, pin_hash, role)
        VALUES (1, ?, ?, ?, ?)
      `, ['admin@lslt.local', 'System Administrator', adminPinHash, 'admin']);
    }

    // Insert default system settings
    const defaultSettings = [
      ['smtp_host', '', 'string', 'SMTP server hostname'],
      ['smtp_port', '587', 'number', 'SMTP server port'],
      ['smtp_user', '', 'string', 'SMTP username'],
      ['smtp_pass', '', 'string', 'SMTP password'],
      ['unifi_host', '', 'string', 'UniFi controller hostname'],
      ['unifi_username', '', 'string', 'UniFi username'],
      ['unifi_password', '', 'string', 'UniFi password'],
      ['captive_portal_enabled', 'true', 'boolean', 'Enable captive portal'],
      ['marketing_enabled', 'true', 'boolean', 'Enable marketing features'],
      ['device_blocking_enabled', 'true', 'boolean', 'Enable device blocking'],
      ['backup_enabled', 'false', 'boolean', 'Enable automatic backups']
    ];

    for (const [key, value, type, description] of defaultSettings) {
      const existing = await this.get('SELECT id FROM system_settings WHERE key = ?', [key]);
      if (!existing) {
        await this.run(`
          INSERT INTO system_settings (key, value, type, description)
          VALUES (?, ?, ?, ?)
        `, [key, value, type, description]);
      }
    }

    console.log('Default data inserted successfully');
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }
}

module.exports = new Database();