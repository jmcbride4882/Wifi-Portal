#!/bin/bash

# LSLT WiFi Loyalty & Captive Portal Suite - Raspberry Pi Installer
# Version: 1.0.0
# Compatible with: Raspberry Pi 4/5 running Raspberry Pi OS (Bullseye/Bookworm)

set -e  # Exit on any error

# Set non-interactive mode for all package operations
export DEBIAN_FRONTEND=noninteractive

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/lslt-portal"
SERVICE_USER="lslt-portal"
DB_DIR="/var/lib/lslt-portal"
LOG_DIR="/var/log/lslt-portal"
CONFIG_DIR="/etc/lslt-portal"
NGINX_SITES_DIR="/etc/nginx/sites-available"
SYSTEMD_DIR="/etc/systemd/system"

# Script info
SCRIPT_VERSION="1.0.0"
REQUIRED_MEMORY_MB=2048  # Minimum 2GB RAM
REQUIRED_DISK_GB=8       # Minimum 8GB free disk space

# Functions
print_banner() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║        LSLT WiFi Loyalty & Captive Portal Suite             ║"
    echo "║                   Raspberry Pi Installer                    ║"
    echo "║                      Version ${SCRIPT_VERSION}                         ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Check system requirements
check_requirements() {
    log "Checking system requirements..."
    
    # Check if running on Raspberry Pi
    if ! grep -q "Raspberry Pi" /proc/cpuinfo; then
        warn "This script is designed for Raspberry Pi. Continuing anyway..."
    fi
    
    # Check OS
    if ! command -v apt-get &> /dev/null; then
        error "This installer requires a Debian-based system with apt-get"
    fi
    
    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
    fi
    
    # Check memory
    MEMORY_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    MEMORY_MB=$((MEMORY_KB / 1024))
    if [ $MEMORY_MB -lt $REQUIRED_MEMORY_MB ]; then
        warn "System has ${MEMORY_MB}MB RAM. Recommended: ${REQUIRED_MEMORY_MB}MB+"
    else
        log "Memory check passed: ${MEMORY_MB}MB RAM"
    fi
    
    # Check disk space
    AVAILABLE_GB=$(df / | awk 'NR==2 {print int($4/1024/1024)}')
    if [ $AVAILABLE_GB -lt $REQUIRED_DISK_GB ]; then
        error "Insufficient disk space. Available: ${AVAILABLE_GB}GB, Required: ${REQUIRED_DISK_GB}GB"
    else
        log "Disk space check passed: ${AVAILABLE_GB}GB available"
    fi
    
    # Check internet connectivity
    if ! ping -c 1 google.com &> /dev/null; then
        error "No internet connection. Please check your network settings."
    fi
    
    log "System requirements check completed"
}

# Create system user and directories
setup_system_user() {
    log "Setting up system user and directories..."
    
    # Create system user
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd -r -s /bin/false -d "$INSTALL_DIR" -c "LSLT Portal Service" "$SERVICE_USER"
        log "Created user: $SERVICE_USER"
    else
        log "User $SERVICE_USER already exists"
    fi
    
    # Create directories
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$DB_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DB_DIR/backup"
    
    # Set ownership
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$DB_DIR"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR"
    
    log "System user and directories created"
}

# Update system packages
update_system() {
    log "Updating system packages..."
    
    # Set non-interactive mode for package operations
    export DEBIAN_FRONTEND=noninteractive
    
    # Update package lists
    apt-get update
    
    # Upgrade existing packages with non-interactive configuration handling
    apt-get upgrade -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold"
    
    # Install essential packages
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        curl \
        wget \
        git \
        unzip \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        ufw \
        fail2ban \
        logrotate \
        htop \
        iotop \
        nmap \
        tcpdump \
        dnsutils \
        net-tools
    
    log "System packages updated"
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js and npm..."
    
    # Download and run NodeSource setup script
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    
    # Install Node.js
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        nodejs
    
    # Verify installation
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    
    if [[ $NODE_VERSION && $NPM_VERSION ]]; then
        log "Node.js installed: $NODE_VERSION"
        log "npm installed: $NPM_VERSION"
    else
        error "Failed to install Node.js or npm"
    fi
    
    # npm is already at a compatible version, no update needed
    
    log "Node.js setup completed"
}

# Install Python dependencies
install_python() {
    log "Installing Python and dependencies..."
    
    # Install Python 3 and pip
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        libcups2-dev \
        libssl-dev \
        libffi-dev \
        libjpeg-dev \
        zlib1g-dev \
        libfreetype6-dev \
        liblcms2-dev \
        libopenjp2-7-dev \
        libtiff5-dev \
        libwebp-dev \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg62-turbo-dev \
        libgif-dev \
        librsvg2-dev
    
    # Verify installation
    PYTHON_VERSION=$(python3 --version)
    PIP_VERSION=$(pip3 --version)
    
    if [[ $PYTHON_VERSION && $PIP_VERSION ]]; then
        log "Python installed: $PYTHON_VERSION"
        log "pip installed: $PIP_VERSION"
    else
        error "Failed to install Python or pip"
    fi
    
    log "Python setup completed"
}

# Install SQLite
install_sqlite() {
    log "Installing SQLite..."
    
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        sqlite3 libsqlite3-dev
    
    # Verify installation
    SQLITE_VERSION=$(sqlite3 --version)
    
    if [[ $SQLITE_VERSION ]]; then
        log "SQLite installed: $SQLITE_VERSION"
    else
        error "Failed to install SQLite"
    fi
    
    log "SQLite setup completed"
}

# Install and configure Nginx
install_nginx() {
    log "Installing and configuring Nginx..."
    
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        nginx
    
    # Enable and start Nginx
    systemctl enable nginx
    systemctl start nginx
    
    # Test nginx configuration
    nginx -t
    
    log "Nginx configuration completed"
}

# Configure firewall
configure_firewall() {
    log "Configuring firewall (UFW)..."
    
    # Set default policies
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow essential services
    ufw allow ssh
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    ufw allow 3001/tcp  # Node.js API
    ufw allow 8000/tcp  # Python services
    ufw allow 53/tcp    # DNS
    ufw allow 53/udp    # DNS
    
    # Enable firewall
    ufw --force enable
    
    log "Firewall configured"
}

# Install printing support
install_printing() {
    log "Installing printing support (CUPS)..."
    
    # Install CUPS and printer drivers
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        cups \
        cups-client \
        cups-bsd \
        cups-filters \
        printer-driver-cups-pdf \
        printer-driver-all \
        hplip \
        system-config-printer
    
    # Enable and start CUPS
    systemctl enable cups
    systemctl start cups
    
    # Add service user to lp group
    usermod -a -G lp "$SERVICE_USER"
    
    log "Printing support installed"
}

# Install dnsmasq for DHCP/DNS
install_dnsmasq() {
    log "Installing dnsmasq for DHCP/DNS..."
    
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        dnsmasq dnsmasq-utils
    
    # Enable dnsmasq
    systemctl enable dnsmasq
    
    log "dnsmasq installed and configured"
}

# Setup LSLT Portal application
setup_application() {
    log "Setting up LSLT Portal application..."
    
    # Clone repository from GitHub
    if [ -d "lslt-portal-source" ]; then
        rm -rf lslt-portal-source
    fi
    
    # Clone the application from GitHub
    if git clone https://github.com/jmcbride4882/Wifi-Portal.git lslt-portal-source 2>/dev/null; then
        log "Successfully cloned application from GitHub"
    else
        warn "Unable to clone from GitHub. Creating basic structure..."
        
        mkdir -p lslt-portal-source/{backend,frontend,python-services}
        
        # Create fallback package.json with correct dependencies
        if [ ! -f "lslt-portal-source/package.json" ]; then
            cat > lslt-portal-source/package.json << 'EOF'
{
  "name": "lslt-wifi-portal",
  "version": "1.0.0",
  "description": "LSLT WiFi Loyalty & Captive Portal Suite",
  "main": "backend/server.js",
  "scripts": {
    "start": "node backend/server.js",
    "dev": "nodemon backend/server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "rate-limiter-flexible": "^7.2.0",
    "nodemailer": "^6.9.7",
    "qrcode": "^1.5.3",
    "jsbarcode": "^3.11.5",
    "moment": "^2.29.4",
    "axios": "^1.6.2",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.32.6",
    "canvas": "^2.11.2",
    "winston": "^3.11.0",
    "winston-daily-rotate-file": "^4.7.1",
    "node-cron": "^3.0.2",
    "express-validator": "^7.0.1",
    "compression": "^1.7.4",
    "express-rate-limit": "^7.1.5",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
}
EOF
        fi
    fi
    
    # Move application to install directory
    cp -r lslt-portal-source/* $INSTALL_DIR/
    
    # Set ownership
    chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR
    
    # Install Node.js dependencies
    cd $INSTALL_DIR
    sudo -u $SERVICE_USER npm install --omit=dev
    
    # Build frontend
    cd $INSTALL_DIR/frontend
    
    # Ensure proper frontend setup
    if [ ! -f "package.json" ]; then
        warn "Frontend package.json not found. Creating basic one..."
        sudo -u $SERVICE_USER cat > package.json << 'EOF'
{
  "name": "lslt-wifi-portal-frontend",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc && vite build",
    "dev": "vite"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.1.1",
    "vite": "^4.5.14",
    "typescript": "^5.2.2"
  }
}
EOF
    fi
    
    # Ensure index.html exists in frontend root
    if [ ! -f "index.html" ]; then
        warn "index.html not found. Creating it..."
        sudo -u $SERVICE_USER cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="LSLT WiFi Portal - Secure guest WiFi with loyalty rewards" />
    <meta name="keywords" content="wifi, captive portal, loyalty, guest network" />
    <title>LSLT WiFi Portal</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
        chown $SERVICE_USER:$SERVICE_USER index.html
    fi
    
    # Ensure vite.config.ts has proper configuration
    if [ ! -f "vite.config.ts" ]; then
        sudo -u $SERVICE_USER cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
})
EOF
        chown $SERVICE_USER:$SERVICE_USER vite.config.ts
    fi
    
    # Install frontend dependencies and build
    sudo -u $SERVICE_USER npm install
    sudo -u $SERVICE_USER npm run build
    
    cd $INSTALL_DIR
    
    # Fix logging paths to use system log directory
    sed -i "s|'logs/error.log'|'/var/log/lslt-portal/error.log'|g" backend/server.js 2>/dev/null || true
    sed -i "s|'logs/app.log'|'/var/log/lslt-portal/app.log'|g" backend/server.js 2>/dev/null || true
    sed -i "s|path.join(__dirname, '../../logs/audit-%DATE%.log')|'/var/log/lslt-portal/audit-%DATE%.log'|g" backend/utils/audit.js 2>/dev/null || true
    sed -i "s|symlinkName: 'audit-current.log'|symlinkName: '/var/log/lslt-portal/audit-current.log'|g" backend/utils/audit.js 2>/dev/null || true
    
    # Fix helmet configuration to disable HTTPS-forcing headers
    sed -i '/app\.use(helmet({/,/}));/c\
app.use(helmet({\
  contentSecurityPolicy: {\
    directives: {\
      defaultSrc: ["'\''self'\''"],\
      styleSrc: ["'\''self'\''", "'\''unsafe-inline'\''", "https://fonts.googleapis.com"],\
      fontSrc: ["'\''self'\''", "https://fonts.gstatic.com"],\
      imgSrc: ["'\''self'\''", "data:", "https:"],\
      scriptSrc: ["'\''self'\''", "'\''unsafe-inline'\''"],\
      connectSrc: ["'\''self'\''"]\
    }\
  },\
  crossOriginOpenerPolicy: false,\
  originAgentCluster: false,\
  hsts: false\
}));' backend/server.js 2>/dev/null || true
    
    # Fix Python service log paths
    sed -i 's|../logs/python-services.log|/var/log/lslt-portal/python-services.log|g' python-services/main.py 2>/dev/null || true
    sed -i 's|logs/python-services.log|/var/log/lslt-portal/python-services.log|g' python-services/main.py 2>/dev/null || true
    
    # Setup Python virtual environment
    sudo -u $SERVICE_USER python3 -m venv python-services/venv
    sudo -u $SERVICE_USER python-services/venv/bin/pip install -r python-services/requirements.txt 2>/dev/null || {
        warn "No Python requirements.txt found. Creating basic one..."
        cat > python-services/requirements.txt << 'EOF'
fastapi==0.104.1
uvicorn[standard]==0.24.0
requests==2.31.0
aiohttp==3.9.1
python-escpos==3.0a9
pillow==10.1.0
qrcode[pil]==7.4.2
pycups==2.0.4
reportlab==4.0.7
pydantic==2.5.0
python-multipart==0.0.6
jinja2==3.1.2
schedule==1.2.0
email-validator==2.1.0
EOF
        sudo -u $SERVICE_USER python-services/venv/bin/pip install -r python-services/requirements.txt
    }
    
    # Setup database
    sudo -u $SERVICE_USER node backend/scripts/setup-database.js || {
        warn "Database setup script not found or failed. Manual setup may be required."
    }
    
    # Create Python log file with proper permissions
    touch $LOG_DIR/python-services.log
    chown $SERVICE_USER:$SERVICE_USER $LOG_DIR/python-services.log
    
    log "Application setup completed"
}

# Create systemd services
create_systemd_services() {
    log "Creating systemd services..."
    
    # Main Node.js service
    cat > $SYSTEMD_DIR/lslt-portal.service << EOF
[Unit]
Description=LSLT WiFi Portal - Main Service
Documentation=https://github.com/lslt-systems/wifi-portal
After=network.target
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node backend/server.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lslt-portal

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DB_DIR $LOG_DIR

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF
    
    # Python microservices
    cat > $SYSTEMD_DIR/lslt-portal-python.service << EOF
[Unit]
Description=LSLT WiFi Portal - Python Microservices
Documentation=https://github.com/lslt-systems/wifi-portal
After=network.target lslt-portal.service
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/python-services
Environment=PYTHONPATH=$INSTALL_DIR/python-services
ExecStart=$INSTALL_DIR/python-services/venv/bin/python main.py
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lslt-portal-python

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$LOG_DIR

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF
    
    # Database backup service
    cat > $SYSTEMD_DIR/lslt-portal-backup.service << EOF
[Unit]
Description=LSLT WiFi Portal - Database Backup
Documentation=https://github.com/lslt-systems/wifi-portal

[Service]
Type=oneshot
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$DB_DIR
ExecStart=/bin/bash -c 'sqlite3 lslt_portal.db ".backup backup/lslt_portal_\$(date +%%Y%%m%%d_%%H%%M%%S).db"'
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lslt-portal-backup
EOF
    
    # Backup timer (daily at 2 AM)
    cat > $SYSTEMD_DIR/lslt-portal-backup.timer << 'EOF'
[Unit]
Description=LSLT WiFi Portal - Daily Database Backup
Requires=lslt-portal-backup.service

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF
    
    # Log cleanup service
    cat > $SYSTEMD_DIR/lslt-portal-logclean.service << EOF
[Unit]
Description=LSLT WiFi Portal - Log Cleanup


[Service]
Type=oneshot
User=$SERVICE_USER
Group=$SERVICE_USER
ExecStart=/bin/bash -c 'find $LOG_DIR -type f -name "*.log" -mtime +30 -delete'
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lslt-portal-logclean
EOF
    
    # Log cleanup timer (weekly)
    cat > $SYSTEMD_DIR/lslt-portal-logclean.timer << 'EOF'
[Unit]
Description=LSLT WiFi Portal - Weekly Log Cleanup
Requires=lslt-portal-logclean.service

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
EOF
    
    # Create backup directory
    mkdir -p $DB_DIR/backup
    chown -R $SERVICE_USER:$SERVICE_USER $DB_DIR/backup
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable services
    systemctl enable lslt-portal.service
    systemctl enable lslt-portal-python.service
    systemctl enable lslt-portal-backup.timer
    systemctl enable lslt-portal-logclean.timer
    
    log "Systemd services created"
}

# Configure log rotation
configure_logging() {
    log "Configuring log rotation..."
    
    # Create logrotate configuration
    cat > /etc/logrotate.d/lslt-portal << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        systemctl reload lslt-portal lslt-portal-python || true
    endscript
}

/var/log/nginx/lslt-portal-*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        systemctl reload nginx || true
    endscript
}
EOF
    
    log "Log rotation configured"
}

# Configure fail2ban for security
configure_fail2ban() {
    log "Configuring fail2ban for security..."
    
    # Create fail2ban jail for LSLT Portal
    cat > /etc/fail2ban/jail.d/lslt-portal.conf << 'EOF'
[lslt-portal-auth]
enabled = true
port = http,https
filter = lslt-portal-auth
logpath = /var/log/lslt-portal/app.log
maxretry = 5
findtime = 600
bantime = 3600

[lslt-portal-dos]
enabled = true
port = http,https
filter = lslt-portal-dos
logpath = /var/log/lslt-portal/app.log
maxretry = 50
findtime = 60
bantime = 1800
EOF
    
    # Create filter for authentication failures
    cat > /etc/fail2ban/filter.d/lslt-portal-auth.conf << 'EOF'
[Definition]
failregex = ^.*Authentication failed.*IP: <HOST>.*$
            ^.*Invalid credentials.*IP: <HOST>.*$
            ^.*Login attempt failed.*IP: <HOST>.*$

ignoreregex =
EOF
    
    # Create filter for DoS attacks
    cat > /etc/fail2ban/filter.d/lslt-portal-dos.conf << 'EOF'
[Definition]
failregex = ^.*"(GET|POST).*" (4|5)\d\d .*$

ignoreregex =
EOF
    
    # Restart fail2ban
    systemctl restart fail2ban
    
    log "fail2ban configured"
}

# Create network startup script
create_network_script() {
    log "Creating network startup script..."
    
    # Create network setup script
    cat > $CONFIG_DIR/network-setup.sh << 'EOF'
#!/bin/bash

# LSLT WiFi Portal Network Setup Script
# This script sets up network interfaces for captive portal functionality

# Enable IP forwarding
echo 1 > /proc/sys/net/ipv4/ip_forward

# Configure iptables for captive portal (example rules)
# These should be customized based on your network setup

# Allow traffic on loopback
iptables -I INPUT -i lo -j ACCEPT
iptables -I OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -I INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow portal traffic
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -I INPUT -p tcp --dport 443 -j ACCEPT
iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
iptables -I INPUT -p tcp --dport 8000 -j ACCEPT

# Allow DNS
iptables -I INPUT -p tcp --dport 53 -j ACCEPT
iptables -I INPUT -p udp --dport 53 -j ACCEPT

# Log script execution
echo "$(date): Network setup completed" >> /var/log/lslt-portal/network.log
EOF
    
    chmod +x $CONFIG_DIR/network-setup.sh
    chown $SERVICE_USER:$SERVICE_USER $CONFIG_DIR/network-setup.sh
    
    # Create systemd service for network setup
    cat > $SYSTEMD_DIR/lslt-portal-network.service << EOF
[Unit]
Description=LSLT WiFi Portal - Network Setup
After=network.target
Before=lslt-portal.service

[Service]
Type=oneshot
ExecStart=$CONFIG_DIR/network-setup.sh
RemainAfterExit=true
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl enable lslt-portal-network.service
    
    log "Network startup script created"
}

# Create configuration file
create_config_file() {
    log "Creating configuration file..."
    
    cat > $CONFIG_DIR/portal.conf << 'EOF'
# LSLT WiFi Portal Configuration

# Database settings
DB_PATH=/var/lib/lslt-portal/lslt_portal.db

# Network settings
PORTAL_IP=192.168.1.1
PORTAL_PORT=80
API_PORT=3001
PYTHON_API_PORT=8000

# WiFi settings
GUEST_SSID=Guest_WiFi
STAFF_SSID=Staff_WiFi
DATA_LIMIT_MB=750
SESSION_TIMEOUT_HOURS=24

# Email settings (configure these)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
FROM_EMAIL=portal@lslt.local
FROM_NAME=LSLT WiFi Portal

# UniFi settings (configure these)
UNIFI_HOST=https://192.168.1.1
UNIFI_USERNAME=admin
UNIFI_PASSWORD=
UNIFI_SITE=default

# Security settings
JWT_SECRET=change-this-in-production-use-long-random-string
SESSION_SECRET=change-this-in-production-use-long-random-string
BCRYPT_ROUNDS=12

# Features
CAPTIVE_PORTAL_ENABLED=true
LOYALTY_PROGRAM_ENABLED=true
EMAIL_NOTIFICATIONS_ENABLED=true
DEVICE_BLOCKING_ENABLED=true
PRINTING_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=30

# Backup
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=90
EOF
    
    chown $SERVICE_USER:$SERVICE_USER $CONFIG_DIR/portal.conf
    chmod 600 $CONFIG_DIR/portal.conf
    
    log "Configuration file created"
}

# Start services
start_services() {
    log "Starting LSLT Portal services..."
    

    systemctl start lslt-portal-backup.timer
    systemctl start lslt-portal-logclean.timer
    
    # Start main services
    systemctl start lslt-portal-network.service
    systemctl start lslt-portal-python.service
    systemctl start lslt-portal.service
    
    # Check service status
    sleep 5
    
    if systemctl is-active --quiet lslt-portal.service; then
        log "LSLT Portal main service started successfully"
    else
        warn "LSLT Portal main service failed to start. Check: systemctl status lslt-portal"
    fi
    
    if systemctl is-active --quiet lslt-portal-python.service; then
        log "LSLT Portal Python services started successfully"
    else
        warn "LSLT Portal Python services failed to start. Check: systemctl status lslt-portal-python"
    fi
    
    log "Services startup completed"
}

# Display post-installation information
show_completion_info() {
    echo
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                              ║${NC}"
    echo -e "${GREEN}║                    Installation Complete!                   ║${NC}"
    echo -e "${GREEN}║                                                              ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
    
    # Get system IP
    SYSTEM_IP=$(hostname -I | awk '{print $1}')
    
    echo -e "${BLUE}🎉 LSLT WiFi Portal Suite has been successfully installed!${NC}"
    echo
    echo -e "${YELLOW}📋 Access Information:${NC}"
    echo -e "   🌐 Main Portal:     http://$SYSTEM_IP:3001/"
    echo -e "   👥 Staff Portal:    http://$SYSTEM_IP:3001/staff"
    echo -e "   🔧 Admin Portal:    http://$SYSTEM_IP:3001/admin"
    echo -e "   📱 Captive Portal:  http://$SYSTEM_IP:3001/portal"
    echo
    echo -e "${YELLOW}🔐 Default Admin Credentials:${NC}"
    echo -e "   📧 Email: admin@lslt.local"
    echo -e "   🔢 PIN:   280493"
    echo
    echo -e "${YELLOW}📁 Important Directories:${NC}"
    echo -e "   📂 Application:     $INSTALL_DIR"
    echo -e "   🗄️  Database:       $DB_DIR"
    echo -e "   📝 Logs:           $LOG_DIR"
    echo -e "   ⚙️  Configuration:  $CONFIG_DIR"
    echo
    echo -e "${YELLOW}🔧 System Services:${NC}"
    echo -e "   🖥️  Main Service:    systemctl status lslt-portal"
    echo -e "   🐍 Python Services: systemctl status lslt-portal-python"
    echo -e "   📦 Backup Timer:    systemctl status lslt-portal-backup.timer"
    echo
    echo -e "${YELLOW}📚 Next Steps:${NC}"
    echo -e "   1. 🌐 Visit the admin portal to configure settings"
    echo -e "   2. 📧 Update email settings in $CONFIG_DIR/portal.conf"
    echo -e "   3. 🔧 Configure UniFi controller settings (if applicable)"
    echo -e "   4. 🖨️  Set up printer connection for voucher printing"
    echo -e "   5. 🔒 Change default admin credentials"
    echo
    echo -e "${GREEN}✅ The portal is ready to use!${NC}"
    echo
    echo -e "${BLUE}💡 Tips:${NC}"
    echo -e "   • Check service logs: journalctl -u lslt-portal.service -f"
    echo -e "   • Backup location: $DB_DIR/backup/"
    echo -e "   • Restart services: systemctl restart lslt-portal"
    echo
    echo -e "${YELLOW}🆘 Support:${NC}"
    echo -e "   📧 Email: support@lslt.systems"
    echo -e "   🌐 Docs:  https://github.com/lslt-systems/wifi-portal"
    echo
    
    # Final system status
    echo -e "${BLUE}📊 System Status:${NC}"
    if systemctl is-active --quiet lslt-portal.service; then
        echo -e "   ✅ Main Service: ${GREEN}Running${NC}"
    else
        echo -e "   ❌ Main Service: ${RED}Stopped${NC}"
    fi
    
    if systemctl is-active --quiet lslt-portal-python.service; then
        echo -e "   ✅ Python Services: ${GREEN}Running${NC}"
    else
        echo -e "   ❌ Python Services: ${RED}Stopped${NC}"
    fi
    
    if systemctl is-active --quiet nginx; then
        echo -e "   ✅ Nginx: ${GREEN}Running${NC}"
    else
        echo -e "   ❌ Nginx: ${RED}Stopped${NC}"
    fi
    
    echo
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
    rm -rf lslt-portal-source
    rm -f /tmp/nodejs_setup.sh
}

# Main execution function
main() {
    # Print banner
    print_banner
    
    # Run installation steps
    check_requirements
    setup_system_user
    update_system
    install_nodejs
    install_python
    install_sqlite
    install_nginx
    configure_firewall
    install_printing
    install_dnsmasq
    setup_application
    create_systemd_services
    configure_logging
    configure_fail2ban
    create_network_script
    create_config_file
    start_services
    show_completion_info
    cleanup
    
    log "LSLT WiFi Portal installation completed successfully!"
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@"