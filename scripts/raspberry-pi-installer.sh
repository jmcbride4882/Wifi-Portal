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
        error "Internet connection required for installation"
    fi
    
    log "System requirements check completed"
}

# Create system user and directories
setup_system_user() {
    log "Setting up system user and directories..."
    
    # Create service user
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd --system --create-home --shell /bin/bash \
                --home-dir /home/$SERVICE_USER \
                --comment "LSLT Portal Service User" $SERVICE_USER
        log "Created user: $SERVICE_USER"
    else
        log "User $SERVICE_USER already exists"
    fi
    
    # Create directories
    mkdir -p $INSTALL_DIR
    mkdir -p $DB_DIR
    mkdir -p $LOG_DIR
    mkdir -p $CONFIG_DIR
    mkdir -p /home/$SERVICE_USER/.ssh
    
    # Set ownership and permissions
    chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR
    chown -R $SERVICE_USER:$SERVICE_USER $DB_DIR
    chown -R $SERVICE_USER:$SERVICE_USER $LOG_DIR
    chown -R $SERVICE_USER:$SERVICE_USER /home/$SERVICE_USER
    
    chmod 755 $INSTALL_DIR
    chmod 755 $DB_DIR
    chmod 755 $LOG_DIR
    chmod 700 /home/$SERVICE_USER/.ssh
    
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

# Install Node.js and npm
install_nodejs() {
    log "Installing Node.js and npm..."
    
    # Install Node.js 18.x LTS
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        nodejs
    
    # Verify installation
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    
    log "Node.js installed: $NODE_VERSION"
    log "npm installed: $NPM_VERSION"
    
    # Install global packages
    npm install -g pm2 concurrently nodemon
    
    log "Node.js setup completed"
}

# Install Python and dependencies
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
        libwebp-dev
    
    # Verify installation
    PYTHON_VERSION=$(python3 --version)
    PIP_VERSION=$(pip3 --version)
    
    log "Python installed: $PYTHON_VERSION"
    log "pip installed: $PIP_VERSION"
    
    log "Python setup completed"
}

# Install and configure SQLite
install_sqlite() {
    log "Installing SQLite..."
    
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        sqlite3 libsqlite3-dev
    
    # Verify installation
    SQLITE_VERSION=$(sqlite3 --version)
    log "SQLite installed: $SQLITE_VERSION"
    
    log "SQLite setup completed"
}

# Install and configure Nginx
install_nginx() {
    log "Installing and configuring Nginx..."
    
    # Install Nginx
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        nginx
    
    # Enable and start Nginx
    systemctl enable nginx
    systemctl start nginx
    
    # Create Nginx configuration for LSLT Portal
    cat > $NGINX_SITES_DIR/lslt-portal << 'EOF'
# LSLT WiFi Portal - Nginx Configuration

# Rate limiting
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=api:10m rate=60r/m;
limit_req_zone $binary_remote_addr zone=static:10m rate=100r/m;

# Upstream backend
upstream lslt_backend {
    server 127.0.0.1:3001;
    keepalive 32;
}

# Upstream Python services
upstream lslt_python {
    server 127.0.0.1:8000;
    keepalive 16;
}

# Main server block
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;
    
    # Log configuration
    access_log /var/log/nginx/lslt-portal-access.log;
    error_log /var/log/nginx/lslt-portal-error.log;
    
    # Root directory for static files
    root /opt/lslt-portal/frontend/build;
    index index.html;
    
    # API routes with rate limiting
    location /api/auth {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://lslt_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
    
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://lslt_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300;
    }
    
    # Python microservices
    location /python-api/ {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://lslt_python/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }
    
    # Health check
    location /health {
        proxy_pass http://lslt_backend;
        access_log off;
    }
    
    # Static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        limit_req zone=static burst=50 nodelay;
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
    
    # Captive portal detection (for devices checking connectivity)
    location /generate_204 {
        return 204;
    }
    
    location /connecttest.txt {
        return 200 "Microsoft Connect Test";
        add_header Content-Type text/plain;
    }
    
    # Captive portal routes
    location /portal {
        try_files $uri $uri/ /index.html;
    }
    
    # Admin portal routes
    location /admin {
        try_files $uri $uri/ /index.html;
    }
    
    # Staff portal routes
    location /staff {
        try_files $uri $uri/ /index.html;
    }
    
    # Default route - serve React app
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Security: deny access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
    
    location ~ ~$ {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
    
    # Enable the site
    ln -sf $NGINX_SITES_DIR/lslt-portal /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx configuration
    nginx -t
    
    # Reload Nginx
    systemctl reload nginx
    
    log "Nginx configuration completed"
}

# Configure firewall
configure_firewall() {
    log "Configuring firewall (UFW)..."
    
    # Reset UFW to defaults
    ufw --force reset
    
    # Set default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (important!)
    ufw allow ssh
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow DNS
    ufw allow 53
    
    # Allow DHCP (if acting as DHCP server)
    ufw allow 67/udp
    ufw allow 68/udp
    
    # Allow local network access (adjust as needed)
    ufw allow from 192.168.0.0/16
    ufw allow from 10.0.0.0/8
    ufw allow from 172.16.0.0/12
    
    # Enable UFW
    ufw --force enable
    
    log "Firewall configured"
}

# Install CUPS for printing
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
        cups-pdf \
        printer-driver-all \
        hplip \
        system-config-printer
    
    # Add service user to lpadmin group
    usermod -a -G lpadmin $SERVICE_USER
    
    # Enable and start CUPS
    systemctl enable cups
    systemctl start cups
    
    # Configure CUPS to allow network access
    sed -i 's/Listen localhost:631/Listen 631/' /etc/cups/cupsd.conf
    sed -i 's/<Location \/>/<Location \/>\n  Allow @LOCAL/' /etc/cups/cupsd.conf
    sed -i 's/<Location \/admin>/<Location \/admin>\n  Allow @LOCAL/' /etc/cups/cupsd.conf
    
    systemctl restart cups
    
    log "Printing support installed"
}

# Install dnsmasq for DHCP/DNS
install_dnsmasq() {
    log "Installing dnsmasq for DHCP/DNS..."
    
    apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        dnsmasq dnsmasq-utils
    
    # Backup original configuration
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup
    
    # Create LSLT Portal dnsmasq configuration
    cat > /etc/dnsmasq.d/lslt-portal.conf << 'EOF'
# LSLT Portal DNSmasq Configuration

# Interface to bind to (adjust as needed)
interface=eth0

# DHCP range (adjust for your network)
dhcp-range=192.168.1.100,192.168.1.200,255.255.255.0,12h

# Router/gateway
dhcp-option=3,192.168.1.1

# DNS servers
dhcp-option=6,8.8.8.8,8.8.4.4

# Domain name
domain=lslt.local

# Local domain resolution
local=/lslt.local/

# Captive portal redirection
# Redirect all HTTP requests to captive portal
address=/#/192.168.1.1

# Log DHCP requests
log-dhcp

# Cache size
cache-size=1000

# No hosts file
no-hosts

# Read additional hosts from file
addn-hosts=/etc/lslt-portal/hosts

# Upstream DNS servers
server=8.8.8.8
server=8.8.4.4
EOF
    
    # Create hosts file for local resolution
    cat > $CONFIG_DIR/hosts << 'EOF'
# LSLT Portal Local Hosts
192.168.1.1 portal.lslt.local
192.168.1.1 admin.lslt.local
192.168.1.1 staff.lslt.local
192.168.1.1 captive.lslt.local
EOF
    
    # Enable and start dnsmasq
    systemctl enable dnsmasq
    systemctl start dnsmasq
    
    log "dnsmasq installed and configured"
}

# Clone and setup application
setup_application() {
    log "Setting up LSLT Portal application..."
    
    # Switch to service user
    cd /tmp
    
    # Clone repository from GitHub
    if [ -d "lslt-portal-source" ]; then
        rm -rf lslt-portal-source
    fi
    
    # Clone the application from GitHub
    if git clone https://github.com/jmcbride4882/Wifi-Portal.git lslt-portal-source 2>/dev/null; then
        log "Successfully cloned application from GitHub"
    else
        warn "Unable to clone from GitHub. Creating basic structure..."
        
        # Create basic structure if files not available
        mkdir -p lslt-portal-source/backend
        mkdir -p lslt-portal-source/frontend
        mkdir -p lslt-portal-source/python-services
        mkdir -p lslt-portal-source/scripts
        mkdir -p lslt-portal-source/config
        
        # Create package.json if it doesn't exist
        if [ ! -f "lslt-portal-source/package.json" ]; then
            cat > lslt-portal-source/package.json << 'EOF'
{
  "name": "lslt-wifi-portal",
  "version": "1.0.0",
  "description": "LSLT WiFi Loyalty & Captive Portal Suite",
  "main": "backend/server.js",
  "scripts": {
    "start": "node backend/server.js",
    "dev": "concurrently \"npm run server\" \"npm run client\" \"npm run python-services\"",
    "server": "nodemon backend/server.js",
    "client": "cd frontend && npm start",
    "python-services": "python3 python-services/main.py",
    "build": "cd frontend && npm run build",
    "install-all": "npm install && cd frontend && npm install",
    "setup-db": "node backend/scripts/setup-database.js",
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
    "winston": "^3.11.0",
    "winston-daily-rotate-file": "^4.7.1",
    "node-cron": "^3.0.2",
    "express-validator": "^7.0.1",
    "compression": "^1.7.4",
    "express-rate-limit": "^7.1.5",
    "csv-writer": "^1.6.0",
    "pdf-lib": "^1.17.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "concurrently": "^8.2.2",
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
    
    # Fix logging paths to use system log directory
    sed -i "s|'logs/error.log'|'/var/log/lslt-portal/error.log'|g" backend/server.js
    sed -i "s|'logs/app.log'|'/var/log/lslt-portal/app.log'|g" backend/server.js
    sed -i "s|path.join(__dirname, '../../logs/audit-%DATE%.log')|'/var/log/lslt-portal/audit-%DATE%.log'|g" backend/utils/audit.js
    sed -i "s|symlinkName: 'audit-current.log'|symlinkName: '/var/log/lslt-portal/audit-current.log'|g" backend/utils/audit.js
    
    # Setup database
    sudo -u $SERVICE_USER node backend/scripts/setup-database.js || {
        warn "Database setup script not found or failed. Manual setup may be required."
    }
    
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
Documentation=https://github.com/lslt-systems/wifi-portal

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
logpath = /var/log/nginx/lslt-portal-access.log
maxretry = 5
bantime = 3600
findtime = 600

[lslt-portal-api]
enabled = true
port = http,https
filter = lslt-portal-api
logpath = /var/log/nginx/lslt-portal-access.log
maxretry = 20
bantime = 1800
findtime = 300
EOF
    
    # Create fail2ban filters
    cat > /etc/fail2ban/filter.d/lslt-portal-auth.conf << 'EOF'
[Definition]
failregex = ^<HOST> - - \[.*\] "POST /api/auth/(login|signup) HTTP/.*" (400|401|403) .*$
ignoreregex =
EOF
    
    cat > /etc/fail2ban/filter.d/lslt-portal-api.conf << 'EOF'
[Definition]
failregex = ^<HOST> - - \[.*\] "(GET|POST|PUT|DELETE) /api/.* HTTP/.*" (429|500) .*$
ignoreregex =
EOF
    
    # Restart fail2ban
    systemctl restart fail2ban
    
    log "fail2ban configured"
}

# Create startup script for network configuration
create_network_startup() {
    log "Creating network startup script..."
    
    cat > $CONFIG_DIR/network-setup.sh << 'EOF'
#!/bin/bash
# LSLT Portal Network Setup Script

# Configure iptables for captive portal
# Redirect HTTP traffic to captive portal
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j DNAT --to-destination 192.168.1.1:80
iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.1.1:80

# Allow established connections
iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow access to local services
iptables -A FORWARD -d 192.168.1.1 -j ACCEPT

# Save iptables rules
iptables-save > /etc/iptables/rules.v4

# Enable IP forwarding
echo 1 > /proc/sys/net/ipv4/ip_forward
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

echo "Network setup completed"
EOF
    
    chmod +x $CONFIG_DIR/network-setup.sh
    
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
    
    # Start timers
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
    echo -e "${GREEN}║        LSLT WiFi Portal Installation Completed!             ║${NC}"
    echo -e "${GREEN}║                                                              ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "${BLUE}📋 Installation Summary:${NC}"
    echo "   • Installation Directory: $INSTALL_DIR"
    echo "   • Database Directory: $DB_DIR"
    echo "   • Configuration Directory: $CONFIG_DIR"
    echo "   • Service User: $SERVICE_USER"
    echo
    echo -e "${BLUE}🌐 Access URLs:${NC}"
    echo "   • Captive Portal: http://$(hostname -I | awk '{print $1}')/portal"
    echo "   • Admin Portal: http://$(hostname -I | awk '{print $1}')/admin"
    echo "   • Staff Portal: http://$(hostname -I | awk '{print $1}')/staff"
    echo "   • API Health Check: http://$(hostname -I | awk '{print $1}')/health"
    echo
    echo -e "${BLUE}🔑 Default Admin Credentials:${NC}"
    echo "   • Email: admin@lslt.local"
    echo "   • PIN: 280493"
    echo
    echo -e "${BLUE}⚙️  System Services:${NC}"
    echo "   • Main Service: systemctl status lslt-portal"
    echo "   • Python Services: systemctl status lslt-portal-python"
    echo "   • View Logs: journalctl -u lslt-portal -f"
    echo
    echo -e "${BLUE}📁 Important Files:${NC}"
    echo "   • Configuration: $CONFIG_DIR/portal.conf"
    echo "   • Database: $DB_DIR/lslt_portal.db"
    echo "   • Nginx Config: $NGINX_SITES_DIR/lslt-portal"
    echo "   • Log Directory: $LOG_DIR"
    echo
    echo -e "${YELLOW}⚠️  Next Steps:${NC}"
    echo "   1. Configure email settings in $CONFIG_DIR/portal.conf"
    echo "   2. Configure UniFi controller settings"
    echo "   3. Set up printer connections in CUPS (http://$(hostname -I | awk '{print $1}'):631)"
    echo "   4. Configure WiFi access points and captive portal"
    echo "   5. Test the installation by visiting the access URLs above"
    echo "   6. Change default admin PIN in the admin portal"
    echo
    echo -e "${YELLOW}📖 Documentation:${NC}"
    echo "   • Full documentation: $INSTALL_DIR/README.md"
    echo "   • Troubleshooting: $INSTALL_DIR/docs/troubleshooting.md"
    echo "   • API Documentation: $INSTALL_DIR/docs/api.md"
    echo
    echo -e "${GREEN}Installation completed successfully! 🎉${NC}"
    echo
}

# Main installation function
main() {
    print_banner
    
    log "Starting LSLT WiFi Portal installation..."
    
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
    create_network_startup
    create_config_file
    start_services
    
    show_completion_info
}

# Handle script interruption
trap 'error "Installation interrupted"' INT TERM

# Run main function
main "$@"