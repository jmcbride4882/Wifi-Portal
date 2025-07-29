# LSLT WiFi Loyalty & Captive Portal Suite

A comprehensive WiFi captive portal solution with integrated loyalty system, staff management, and admin dashboard designed for Raspberry Pi deployment with UniFi integration.

## 🚀 Features

### 📱 Customer Experience
- **Bilingual Captive Portal** (English/Spanish) with modern UI
- **Customer Registration & Login** with email/DOB authentication
- **Loyalty Tier System** (Bronze → Silver → Gold → Platinum)
- **QR Voucher System** with automatic email delivery
- **Device Management** with configurable limits
- **Data Usage Tracking** with 750MB free tier
- **Marketing Consent & Campaigns**

### 👥 Staff Portal
- **PIN-based Authentication** with security lockout
- **QR Code Scanner** for voucher redemption
- **Receipt Printing** on 80mm thermal printers
- **Premium WiFi Voucher** generation
- **Staff WiFi Access** with daily limits
- **Manager Override** capabilities

### 🛠 Admin Dashboard
- **Comprehensive Analytics** with real-time metrics
- **User Management** with loyalty tracking
- **Device Blocking** via UniFi API integration
- **Printer Management** (80mm, A4, Label printers)
- **Site Configuration** with branding
- **Security Audit Logs** with 1-year retention
- **Marketing Campaigns** with segmentation

### 🔧 Technical Features
- **UniFi Integration** for device management
- **Multi-printer Support** (thermal, A4, label)
- **Email Templates** with QR code generation
- **SQLite Database** with comprehensive schema
- **JWT Authentication** with role-based access
- **Rate Limiting** and abuse detection
- **Automatic Backups** and system updates

## 🏗 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend │    │  Node.js Backend │    │ Python Services │
│                 │    │                 │    │                 │
│ • Captive Portal│    │ • API Server    │    │ • Printer Ctrl  │
│ • Staff Portal  │    │ • Auth System   │    │ • UniFi API     │
│ • Admin Dashboard│    │ • JWT Security  │    │ • Email Service │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │ SQLite Database │
                    │                 │
                    │ • Users/Devices │
                    │ • Vouchers/Logs │
                    │ • Staff/Settings│
                    └─────────────────┘
```

## 📋 Prerequisites

### Hardware Requirements
- **Raspberry Pi 4/5** (4GB+ RAM recommended)
- **MicroSD Card** (32GB+ Class 10)
- **Ethernet Connection** to UniFi UDM/UDM SE
- **80mm Thermal Printer** (ESC/POS compatible)
- **A4 Network Printer** (HP recommended)
- **Optional: Label Printer** (Brother compatible)

### Network Requirements
- **UniFi Dream Machine** (UDM/UDM SE/UDM Pro)
- **Guest WiFi Network** configured
- **Static IP** for Raspberry Pi
- **Printer Network Access** (same VLAN)

## 🔧 Installation

### Quick Install (Recommended)

1. **Flash Raspberry Pi OS** to SD card
2. **Enable SSH** and connect to network
3. **Run the installer**:

```bash
# Download and run installer
curl -fsSL https://raw.githubusercontent.com/jmcbride4882/Wifi-Portal/main/scripts/raspberry-pi-installer.sh | sudo bash
```

### Manual Installation

1. **Clone Repository**:
```bash
git clone https://github.com/jmcbride4882/Wifi-Portal.git
cd Wifi-Portal
```

2. **Install Dependencies**:
```bash
# Backend
npm install

# Frontend
cd frontend && npm install && npm run build && cd ..

# Python Services
cd python-services
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..
```

3. **Setup Database**:
```bash
npm run setup-db
```

4. **Configure Environment**:
```bash
cp .env.example .env
# Edit .env with your settings
```

5. **Start Services**:
```bash
# Development
npm run dev

# Production
npm start
```

## ⚙️ Configuration

### Initial Setup

1. **Access Admin Portal**: `http://your-pi-ip:3001/admin`
2. **Default Credentials**:
   - Email: `admin@lslt.local`
   - PIN: `280493`
3. **Change Default Credentials** immediately
4. **Configure Site Settings**:
   - Company name and branding
   - WiFi SSID and network settings
   - Loyalty tier thresholds

### UniFi Integration

1. **Enable UniFi API**:
```bash
# Set environment variables
export UNIFI_HOST=https://your-udm-ip:8443
export UNIFI_USERNAME=your-username
export UNIFI_PASSWORD=your-password
export UNIFI_SITE=default
```

2. **Test Connection**:
```bash
curl -k -X POST https://your-udm-ip:8443/api/login \
  -d '{"username":"user","password":"pass"}'
```

### Printer Setup

1. **Auto-discovery**: Printers on same network are automatically detected
2. **Manual Configuration**: Add printers by IP in admin portal
3. **Test Printing**: Use admin portal test buttons

### Email Configuration

```bash
# SMTP Settings
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your-email@gmail.com
export SMTP_PASSWORD=your-app-password
export FROM_NAME="Your Business Name"
```

## 🚦 Usage

### Customer Journey

1. **Connect to WiFi** → Redirected to captive portal
2. **Choose Language** (EN/ES)
3. **Sign Up** or **Login** with email/DOB
4. **Marketing Consent** → Get welcome voucher
5. **WiFi Access** with 750MB data limit
6. **Loyalty Progress** tracked automatically

### Staff Operations

1. **Staff Login** with email + PIN
2. **Scan QR Vouchers** for redemption
3. **Issue Premium WiFi** vouchers
4. **Generate Staff WiFi** access (1/day)
5. **Print Receipts** automatically

### Admin Functions

1. **Dashboard Overview** with live metrics
2. **User Management** and loyalty tracking
3. **Device Blocking** via UniFi API
4. **Marketing Campaigns** with targeting
5. **Analytics & Reports** export
6. **System Configuration** and branding

## 📊 API Documentation

### Authentication Endpoints

```javascript
POST /api/auth/customer/signup
POST /api/auth/customer/login
POST /api/auth/staff/login
POST /api/auth/staff/change-pin
```

### Voucher Management

```javascript
POST /api/vouchers/redeem
GET  /api/vouchers/lookup/:code
POST /api/vouchers/premium-wifi
POST /api/vouchers/staff-wifi
GET  /api/vouchers/analytics
```

### Python Services

```python
POST /print/receipt
POST /print/voucher
POST /unifi/block-device
POST /email/send-voucher
```

## 🔒 Security Features

- **JWT Authentication** with token rotation
- **PIN Security** with lockout after 3 attempts
- **Device Blocking** via UniFi API
- **Rate Limiting** on all endpoints
- **Audit Logging** with 1-year retention
- **Data Encryption** for sensitive information
- **Network Isolation** with firewall rules

## 📈 Loyalty System

### Tier Structure
- **Bronze** (0 visits): Welcome reward
- **Silver** (5 visits): Free appetizer
- **Gold** (15 visits): Free meal
- **Platinum** (30 visits): Dinner for two

### Features
- **Visit Tracking** automatic
- **Tier Progression** with rewards
- **Family Grouping** support
- **Cross-location** loyalty
- **Birthday Rewards** automated
- **Re-engagement** campaigns

## 🖨 Printer Integration

### Supported Printers
- **80mm Thermal**: ESC/POS compatible (Epson, Star)
- **A4 Network**: HP, Canon, Brother
- **Label Printers**: Brother P-touch series

### Print Types
- **Receipts**: Voucher redemption confirmations
- **Vouchers**: QR codes with details
- **Reports**: Analytics and audit logs
- **Labels**: Optional voucher labels

## 🛡 Troubleshooting

### Common Issues

1. **Services Not Starting**:
```bash
sudo systemctl status lslt-portal
sudo journalctl -u lslt-portal -f
```

2. **Database Issues**:
```bash
sudo -u lslt sqlite3 /opt/lslt-portal/config/lslt_portal.db ".tables"
```

3. **UniFi Connection**:
```bash
curl -k https://your-udm-ip:8443/api/self
```

4. **Printer Problems**:
```bash
lpstat -p
sudo systemctl restart cups
```

### Log Files
- **Application**: `/opt/lslt-portal/logs/`
- **System**: `/var/log/lslt-installer.log`
- **Services**: `journalctl -u lslt-portal`

## 🔄 Updates

### Automatic Updates
```bash
# Enable auto-updates (runs daily)
sudo systemctl enable lslt-updater.timer
```

### Manual Updates
```bash
cd /opt/lslt-portal
sudo -u lslt git pull origin main
sudo systemctl restart lslt-portal lslt-python-services
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **UniFi API** for network management
- **shadcn/ui** for React components
- **Tailwind CSS** for styling
- **ESC/POS** printer libraries
- **React Query** for state management

## 📞 Support

- **Documentation**: [GitHub Wiki](https://github.com/jmcbride4882/Wifi-Portal/wiki)
- **Issues**: [GitHub Issues](https://github.com/jmcbride4882/Wifi-Portal/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jmcbride4882/Wifi-Portal/discussions)

---

**Built with ❤️ for small businesses by LSLT Systems**