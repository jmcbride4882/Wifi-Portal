import asyncio
import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
from typing import Dict, Any, Optional, List
from jinja2 import Environment, FileSystemLoader, Template
import os
import base64
import io

logger = logging.getLogger(__name__)

class EmailService:
    """Service for handling email communications"""
    
    def __init__(self):
        self.smtp_host = None
        self.smtp_port = None
        self.smtp_user = None
        self.smtp_password = None
        self.smtp_use_tls = True
        self.smtp_use_ssl = False
        self.from_email = None
        self.from_name = None
        self.template_env = None
        self.initialized = False
        
    async def initialize(self):
        """Initialize email service with configuration"""
        try:
            logger.info("Initializing email service...")
            
            # Load configuration
            await self._load_config()
            
            if not self.smtp_host or not self.smtp_user or not self.smtp_password:
                logger.warning("SMTP credentials not configured, email service will be unavailable")
                return
            
            # Initialize Jinja2 template environment
            template_dir = os.path.join(os.path.dirname(__file__), '../templates')
            if os.path.exists(template_dir):
                self.template_env = Environment(
                    loader=FileSystemLoader(template_dir),
                    trim_blocks=True,
                    lstrip_blocks=True
                )
            else:
                # Create template directory and default templates
                await self._create_default_templates()
            
            # Test SMTP connection
            await self._test_smtp_connection()
            
            self.initialized = True
            logger.info("Email service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize email service: {e}")
            # Don't raise exception - service should work without email if needed
    
    async def _load_config(self):
        """Load email configuration from environment or database"""
        import os
        
        # In production, these would come from the database system_settings table
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_user = os.getenv('SMTP_USER', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.smtp_use_tls = os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'
        self.smtp_use_ssl = os.getenv('SMTP_USE_SSL', 'false').lower() == 'true'
        self.from_email = os.getenv('FROM_EMAIL', self.smtp_user)
        self.from_name = os.getenv('FROM_NAME', 'LSLT WiFi Portal')
    
    async def _test_smtp_connection(self):
        """Test SMTP connection"""
        try:
            if self.smtp_use_ssl:
                server = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port)
            else:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port)
                if self.smtp_use_tls:
                    server.starttls()
            
            server.login(self.smtp_user, self.smtp_password)
            server.quit()
            
            logger.info("SMTP connection test successful")
            
        except Exception as e:
            logger.error(f"SMTP connection test failed: {e}")
            raise
    
    async def _create_default_templates(self):
        """Create default email templates"""
        template_dir = os.path.join(os.path.dirname(__file__), '../templates')
        os.makedirs(template_dir, exist_ok=True)
        
        # Voucher email template
        voucher_template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your WiFi Voucher</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #3B82F6; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #3B82F6; }
        .voucher-box { background: linear-gradient(135deg, #3B82F6, #1E40AF); color: white; padding: 25px; border-radius: 10px; text-align: center; margin: 20px 0; }
        .voucher-title { font-size: 22px; font-weight: bold; margin-bottom: 10px; }
        .voucher-code { font-size: 18px; background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 5px; margin: 15px 0; font-family: monospace; letter-spacing: 2px; }
        .qr-code { margin: 20px 0; }
        .details { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px; }
        .button { background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">{{ site_name }}</div>
            <p>{{ site_location }}</p>
        </div>
        
        <div class="voucher-box">
            <div class="voucher-title">{{ voucher.title }}</div>
            <div class="voucher-code">{{ voucher.code }}</div>
            {% if voucher.qr_code %}
            <div class="qr-code">
                <img src="{{ voucher.qr_code }}" alt="QR Code" style="max-width: 150px;">
            </div>
            {% endif %}
        </div>
        
        <div class="details">
            {% if voucher.description %}
            <div class="detail-row">
                <strong>Description:</strong>
                <span>{{ voucher.description }}</span>
            </div>
            {% endif %}
            {% if voucher.value %}
            <div class="detail-row">
                <strong>Value:</strong>
                <span>${{ "%.2f"|format(voucher.value) }}</span>
            </div>
            {% endif %}
            <div class="detail-row">
                <strong>Expires:</strong>
                <span>{{ voucher.expires_at[:10] }}</span>
            </div>
            <div class="detail-row">
                <strong>Type:</strong>
                <span>{{ voucher.type|title }}</span>
            </div>
        </div>
        
        <div style="text-align: center;">
            <a href="#" class="button">Visit Our Location</a>
        </div>
        
        <div class="footer">
            <p>Present this voucher to our staff to redeem your reward.</p>
            <p>Thank you for visiting {{ site_name }}!</p>
            <p><small>This voucher is valid until {{ voucher.expires_at[:10] }}. Terms and conditions apply.</small></p>
        </div>
    </div>
</body>
</html>
        """
        
        # Campaign email template
        campaign_template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ campaign.subject }}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #3B82F6; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #3B82F6; }
        .content { line-height: 1.6; color: #374151; }
        .cta-button { background-color: #3B82F6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px; }
        .unsubscribe { color: #9ca3af; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">{{ site_name }}</div>
            <p>{{ site_location }}</p>
        </div>
        
        <div class="content">
            <h2>{{ campaign.subject }}</h2>
            {{ campaign.content|safe }}
            
            {% if campaign.cta_text and campaign.cta_url %}
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ campaign.cta_url }}" class="cta-button">{{ campaign.cta_text }}</a>
            </div>
            {% endif %}
        </div>
        
        <div class="footer">
            <p>Thank you for being a valued customer!</p>
            <p class="unsubscribe">
                <a href="{{ unsubscribe_url }}" style="color: #9ca3af;">Unsubscribe</a> | 
                <a href="{{ preferences_url }}" style="color: #9ca3af;">Update Preferences</a>
            </p>
        </div>
    </div>
</body>
</html>
        """
        
        # Welcome email template
        welcome_template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to {{ site_name }}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #3B82F6; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #3B82F6; }
        .welcome-box { background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 25px; border-radius: 10px; text-align: center; margin: 20px 0; }
        .tier-badge { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin: 10px 0; }
        .stats { display: flex; justify-content: space-around; margin: 20px 0; }
        .stat { text-align: center; }
        .stat-number { font-size: 24px; font-weight: bold; color: #3B82F6; }
        .stat-label { font-size: 14px; color: #64748b; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">{{ site_name }}</div>
            <p>{{ site_location }}</p>
        </div>
        
        <div class="welcome-box">
            <h2>Welcome, {{ customer.name }}!</h2>
            <p>Thank you for joining our loyalty program</p>
            <div class="tier-badge">{{ customer.loyalty_tier }} Member</div>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <h3>Your Account Summary</h3>
            <div class="stats">
                <div class="stat">
                    <div class="stat-number">{{ customer.visit_count }}</div>
                    <div class="stat-label">Visits</div>
                </div>
                <div class="stat">
                    <div class="stat-number">{{ customer.loyalty_points }}</div>
                    <div class="stat-label">Points</div>
                </div>
                <div class="stat">
                    <div class="stat-number">{{ customer.vouchers_count }}</div>
                    <div class="stat-label">Active Vouchers</div>
                </div>
            </div>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4>Next Steps:</h4>
            <ul>
                <li>Connect to our WiFi network</li>
                <li>Check your vouchers and rewards</li>
                <li>Earn points with each visit</li>
                <li>Unlock exclusive member benefits</li>
            </ul>
        </div>
        
        <div class="footer">
            <p>Welcome to the family!</p>
            <p><small>Visit us again soon to earn more rewards and unlock higher tiers.</small></p>
        </div>
    </div>
</body>
</html>
        """
        
        # Save templates
        templates = {
            'voucher.html': voucher_template,
            'campaign.html': campaign_template,
            'welcome.html': welcome_template
        }
        
        for filename, content in templates.items():
            template_path = os.path.join(template_dir, filename)
            with open(template_path, 'w', encoding='utf-8') as f:
                f.write(content.strip())
        
        # Initialize template environment
        self.template_env = Environment(
            loader=FileSystemLoader(template_dir),
            trim_blocks=True,
            lstrip_blocks=True
        )
        
        logger.info("Default email templates created")
    
    async def send_email(self, to_email: str, subject: str, template_name: str, 
                        template_data: Dict[str, Any], attachments: Optional[List[str]] = None) -> bool:
        """Send email using template"""
        try:
            if not self.initialized:
                logger.warning("Email service not initialized, skipping email")
                return False
            
            # Load and render template
            template = self.template_env.get_template(template_name)
            html_content = template.render(**template_data)
            
            # Create message
            message = MIMEMultipart('alternative')
            message['From'] = f"{self.from_name} <{self.from_email}>"
            message['To'] = to_email
            message['Subject'] = subject
            
            # Add HTML content
            html_part = MIMEText(html_content, 'html', 'utf-8')
            message.attach(html_part)
            
            # Add attachments if provided
            if attachments:
                for attachment_path in attachments:
                    if os.path.exists(attachment_path):
                        await self._add_attachment(message, attachment_path)
            
            # Send email
            await self._send_message(message)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False
    
    async def send_voucher_email(self, voucher_data: Dict[str, Any], customer_email: str) -> bool:
        """Send voucher email to customer"""
        try:
            # Prepare template data
            template_data = {
                'voucher': voucher_data,
                'site_name': 'LSLT Portal',
                'site_location': 'Main Location',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            
            subject = f"Your {voucher_data.get('title', 'Voucher')} - {voucher_data.get('code')}"
            
            return await self.send_email(
                to_email=customer_email,
                subject=subject,
                template_name='voucher.html',
                template_data=template_data
            )
            
        except Exception as e:
            logger.error(f"Failed to send voucher email: {e}")
            return False
    
    async def send_welcome_email(self, customer_data: Dict[str, Any]) -> bool:
        """Send welcome email to new customer"""
        try:
            # Count active vouchers
            vouchers_count = 0  # This would be queried from database
            
            template_data = {
                'customer': {
                    **customer_data,
                    'vouchers_count': vouchers_count
                },
                'site_name': 'LSLT Portal',
                'site_location': 'Main Location',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            
            subject = f"Welcome to LSLT Portal, {customer_data.get('name', '')}!"
            
            return await self.send_email(
                to_email=customer_data['email'],
                subject=subject,
                template_name='welcome.html',
                template_data=template_data
            )
            
        except Exception as e:
            logger.error(f"Failed to send welcome email: {e}")
            return False
    
    async def send_campaign_email(self, campaign_data: Dict[str, Any], recipient_list: List[str]) -> Dict[str, Any]:
        """Send marketing campaign email to multiple recipients"""
        try:
            results = {
                'sent': 0,
                'failed': 0,
                'errors': []
            }
            
            for recipient_email in recipient_list:
                try:
                    # Prepare template data with personalization
                    template_data = {
                        'campaign': campaign_data,
                        'site_name': 'LSLT Portal',
                        'site_location': 'Main Location',
                        'recipient_email': recipient_email,
                        'unsubscribe_url': f"https://portal.lslt.local/unsubscribe?email={recipient_email}",
                        'preferences_url': f"https://portal.lslt.local/preferences?email={recipient_email}",
                        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    }
                    
                    success = await self.send_email(
                        to_email=recipient_email,
                        subject=campaign_data.get('subject', 'Special Offer'),
                        template_name='campaign.html',
                        template_data=template_data
                    )
                    
                    if success:
                        results['sent'] += 1
                    else:
                        results['failed'] += 1
                        results['errors'].append(f"Failed to send to {recipient_email}")
                    
                    # Small delay to avoid overwhelming SMTP server
                    await asyncio.sleep(0.1)
                    
                except Exception as e:
                    results['failed'] += 1
                    results['errors'].append(f"Error sending to {recipient_email}: {str(e)}")
            
            logger.info(f"Campaign email sent: {results['sent']} successful, {results['failed']} failed")
            return results
            
        except Exception as e:
            logger.error(f"Failed to send campaign emails: {e}")
            return {
                'sent': 0,
                'failed': len(recipient_list),
                'errors': [str(e)]
            }
    
    async def send_notification_email(self, to_email: str, notification_type: str, data: Dict[str, Any]) -> bool:
        """Send notification email (alerts, confirmations, etc.)"""
        try:
            notification_templates = {
                'security_alert': {
                    'subject': 'Security Alert - LSLT Portal',
                    'template': 'security_alert.html'
                },
                'voucher_redeemed': {
                    'subject': 'Voucher Redeemed Successfully',
                    'template': 'voucher_redeemed.html'
                },
                'loyalty_tier_upgrade': {
                    'subject': 'Congratulations! Loyalty Tier Upgraded',
                    'template': 'tier_upgrade.html'
                },
                'device_blocked': {
                    'subject': 'Device Access Restricted',
                    'template': 'device_blocked.html'
                }
            }
            
            if notification_type not in notification_templates:
                logger.warning(f"Unknown notification type: {notification_type}")
                return False
            
            notification_config = notification_templates[notification_type]
            
            # Prepare template data
            template_data = {
                **data,
                'site_name': 'LSLT Portal',
                'site_location': 'Main Location',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'notification_type': notification_type
            }
            
            return await self.send_email(
                to_email=to_email,
                subject=notification_config['subject'],
                template_name=notification_config['template'],
                template_data=template_data
            )
            
        except Exception as e:
            logger.error(f"Failed to send notification email: {e}")
            return False
    
    async def _add_attachment(self, message: MIMEMultipart, file_path: str):
        """Add file attachment to email message"""
        try:
            with open(file_path, 'rb') as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
            
            encoders.encode_base64(part)
            
            filename = os.path.basename(file_path)
            part.add_header(
                'Content-Disposition',
                f'attachment; filename= {filename}'
            )
            
            message.attach(part)
            
        except Exception as e:
            logger.error(f"Failed to add attachment {file_path}: {e}")
    
    async def _send_message(self, message: MIMEMultipart):
        """Send email message via SMTP"""
        try:
            # Create SMTP connection
            if self.smtp_use_ssl:
                server = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port)
            else:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port)
                if self.smtp_use_tls:
                    server.starttls()
            
            # Login and send
            server.login(self.smtp_user, self.smtp_password)
            
            text = message.as_string()
            server.sendmail(self.from_email, message['To'], text)
            server.quit()
            
        except Exception as e:
            logger.error(f"SMTP send failed: {e}")
            raise
    
    async def test_email_delivery(self, test_email: str) -> Dict[str, Any]:
        """Test email delivery with a simple test message"""
        try:
            if not self.initialized:
                return {
                    'success': False,
                    'error': 'Email service not initialized'
                }
            
            template_data = {
                'site_name': 'LSLT Portal',
                'site_location': 'Main Location',
                'test_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            
            # Create simple test template
            test_template_content = """
            <html>
            <body>
                <h2>LSLT Portal Email Test</h2>
                <p>This is a test email from the LSLT WiFi Portal system.</p>
                <p><strong>Site:</strong> {{ site_name }}</p>
                <p><strong>Location:</strong> {{ site_location }}</p>
                <p><strong>Test Time:</strong> {{ test_time }}</p>
                <p>If you receive this email, the email service is working correctly.</p>
            </body>
            </html>
            """
            
            template = Template(test_template_content)
            html_content = template.render(**template_data)
            
            # Create and send test message
            message = MIMEMultipart('alternative')
            message['From'] = f"{self.from_name} <{self.from_email}>"
            message['To'] = test_email
            message['Subject'] = 'LSLT Portal - Email Service Test'
            
            html_part = MIMEText(html_content, 'html', 'utf-8')
            message.attach(html_part)
            
            await self._send_message(message)
            
            return {
                'success': True,
                'message': f'Test email sent successfully to {test_email}'
            }
            
        except Exception as e:
            logger.error(f"Email test failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def health_check(self) -> Dict[str, Any]:
        """Health check for email service"""
        try:
            if not self.initialized:
                return {
                    'status': 'unavailable',
                    'message': 'Service not initialized'
                }
            
            # Test SMTP connection
            await self._test_smtp_connection()
            
            return {
                'status': 'healthy',
                'smtp_host': self.smtp_host,
                'smtp_port': self.smtp_port,
                'smtp_user': self.smtp_user,
                'from_email': self.from_email,
                'templates_available': len(self.template_env.list_templates()) if self.template_env else 0
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e),
                'smtp_host': self.smtp_host
            }
    
    async def get_email_stats(self, days: int = 30) -> Dict[str, Any]:
        """Get email statistics (would typically query from a database)"""
        # In a real implementation, this would query email logs from database
        return {
            'period_days': days,
            'emails_sent': 0,
            'emails_failed': 0,
            'success_rate': 0.0,
            'last_sent': None,
            'message': 'Email statistics would be tracked in database'
        }