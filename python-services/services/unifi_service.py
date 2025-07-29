import asyncio
import aiohttp
import logging
import json
import ssl
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import urllib.parse

logger = logging.getLogger(__name__)

class UniFiService:
    """Service for UniFi UDM API integration"""
    
    def __init__(self):
        self.base_url = None
        self.username = None
        self.password = None
        self.session = None
        self.csrf_token = None
        self.cookies = None
        self.site = "default"
        self.initialized = False
        self.last_auth = None
        self.auth_expires = None
    
    async def initialize(self):
        """Initialize UniFi service with configuration"""
        try:
            logger.info("Initializing UniFi service...")
            
            # Load configuration (in real implementation, from database)
            await self._load_config()
            
            if not self.base_url or not self.username or not self.password:
                logger.warning("UniFi credentials not configured, service will be unavailable")
                return
            
            # Create HTTP session
            connector = aiohttp.TCPConnector(ssl=ssl.create_default_context())
            connector.ssl = False  # Disable SSL verification for local controllers
            self.session = aiohttp.ClientSession(
                connector=connector,
                timeout=aiohttp.ClientTimeout(total=30),
                headers={
                    'User-Agent': 'LSLT-WiFi-Portal/1.0',
                    'Content-Type': 'application/json'
                }
            )
            
            # Authenticate
            await self._authenticate()
            
            self.initialized = True
            logger.info("UniFi service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize UniFi service: {e}")
            # Don't raise exception - service should work without UniFi if needed
    
    async def _load_config(self):
        """Load UniFi configuration from environment or database"""
        import os
        
        # In production, these would come from the database system_settings table
        self.base_url = os.getenv('UNIFI_HOST', 'https://192.168.1.1')
        self.username = os.getenv('UNIFI_USERNAME', 'admin')
        self.password = os.getenv('UNIFI_PASSWORD', '')
        self.site = os.getenv('UNIFI_SITE', 'default')
        
        # Ensure base_url has correct format
        if self.base_url and not self.base_url.startswith('http'):
            self.base_url = f"https://{self.base_url}"
        
        # Remove trailing slash
        if self.base_url and self.base_url.endswith('/'):
            self.base_url = self.base_url[:-1]
    
    async def _authenticate(self):
        """Authenticate with UniFi controller"""
        if not self.session or not self.base_url:
            raise Exception("UniFi service not properly initialized")
        
        try:
            auth_url = f"{self.base_url}/api/auth/login"
            
            auth_data = {
                "username": self.username,
                "password": self.password,
                "remember": False
            }
            
            async with self.session.post(auth_url, json=auth_data) as response:
                if response.status == 200:
                    # Extract CSRF token and cookies
                    self.csrf_token = response.headers.get('X-CSRF-Token')
                    self.cookies = response.cookies
                    
                    # Update session headers
                    if self.csrf_token:
                        self.session.headers.update({'X-CSRF-Token': self.csrf_token})
                    
                    self.last_auth = datetime.now()
                    self.auth_expires = self.last_auth + timedelta(hours=24)
                    
                    logger.info("UniFi authentication successful")
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Authentication failed: {response.status} - {error_text}")
                    
        except Exception as e:
            logger.error(f"UniFi authentication failed: {e}")
            raise
    
    async def _ensure_authenticated(self):
        """Ensure we have a valid authentication"""
        if (not self.last_auth or 
            not self.auth_expires or 
            datetime.now() >= self.auth_expires):
            await self._authenticate()
    
    async def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """Make authenticated request to UniFi API"""
        if not self.session:
            raise Exception("UniFi service not initialized")
        
        await self._ensure_authenticated()
        
        url = f"{self.base_url}{endpoint}"
        
        try:
            async with self.session.request(
                method, 
                url, 
                json=data if data else None,
                cookies=self.cookies
            ) as response:
                
                if response.status == 401:
                    # Re-authenticate and retry once
                    await self._authenticate()
                    async with self.session.request(
                        method, 
                        url, 
                        json=data if data else None,
                        cookies=self.cookies
                    ) as retry_response:
                        response_text = await retry_response.text()
                        if retry_response.status >= 400:
                            raise Exception(f"API request failed: {retry_response.status} - {response_text}")
                        return await retry_response.json() if response_text else {}
                
                response_text = await response.text()
                if response.status >= 400:
                    raise Exception(f"API request failed: {response.status} - {response_text}")
                
                return await response.json() if response_text else {}
                
        except aiohttp.ClientError as e:
            logger.error(f"UniFi API request failed: {e}")
            raise Exception(f"Network error: {e}")
    
    async def block_device(self, mac_address: str, reason: str = "Security policy violation") -> Dict[str, Any]:
        """Block a device on the UniFi network"""
        try:
            if not self.initialized:
                raise Exception("UniFi service not available")
            
            # Normalize MAC address
            mac_address = self._normalize_mac(mac_address)
            
            # First, find the device
            device_info = await self.get_device_status(mac_address)
            
            if not device_info or not device_info.get('found'):
                # Device not found, add to blocked list anyway
                logger.warning(f"Device {mac_address} not found in active clients, adding to block list")
            
            # Add to firewall rules or blocked devices list
            block_data = {
                "mac": mac_address,
                "note": f"Blocked: {reason}",
                "blocked": True,
                "timestamp": datetime.now().isoformat()
            }
            
            # Use the network access control endpoint
            endpoint = f"/proxy/network/v2/api/site/{self.site}/firewallrules"
            
            # Create firewall rule to block device
            firewall_rule = {
                "name": f"Block_{mac_address.replace(':', '_')}",
                "ruleset": "LAN_IN",
                "rule_index": 2000,
                "action": "drop",
                "protocol": "all",
                "src_mac_address": mac_address,
                "enabled": True,
                "logging": True
            }
            
            result = await self._make_request("POST", endpoint, firewall_rule)
            
            # Also try to disconnect the device if it's currently connected
            try:
                await self._disconnect_client(mac_address)
            except Exception as e:
                logger.warning(f"Failed to disconnect client {mac_address}: {e}")
            
            logger.info(f"Device {mac_address} blocked successfully: {reason}")
            
            return {
                "blocked": True,
                "mac_address": mac_address,
                "reason": reason,
                "timestamp": datetime.now().isoformat(),
                "firewall_rule_id": result.get("_id")
            }
            
        except Exception as e:
            logger.error(f"Failed to block device {mac_address}: {e}")
            raise
    
    async def unblock_device(self, mac_address: str) -> Dict[str, Any]:
        """Unblock a device on the UniFi network"""
        try:
            if not self.initialized:
                raise Exception("UniFi service not available")
            
            mac_address = self._normalize_mac(mac_address)
            
            # Find and remove firewall rules for this device
            endpoint = f"/proxy/network/v2/api/site/{self.site}/firewallrules"
            
            # Get existing firewall rules
            rules = await self._make_request("GET", endpoint)
            
            rule_name = f"Block_{mac_address.replace(':', '_')}"
            blocked_rules = []
            
            for rule in rules.get("data", []):
                if (rule.get("name") == rule_name or 
                    rule.get("src_mac_address") == mac_address):
                    blocked_rules.append(rule["_id"])
            
            # Delete found rules
            deleted_rules = []
            for rule_id in blocked_rules:
                try:
                    delete_endpoint = f"{endpoint}/{rule_id}"
                    await self._make_request("DELETE", delete_endpoint)
                    deleted_rules.append(rule_id)
                except Exception as e:
                    logger.warning(f"Failed to delete firewall rule {rule_id}: {e}")
            
            logger.info(f"Device {mac_address} unblocked successfully")
            
            return {
                "unblocked": True,
                "mac_address": mac_address,
                "timestamp": datetime.now().isoformat(),
                "deleted_rules": deleted_rules
            }
            
        except Exception as e:
            logger.error(f"Failed to unblock device {mac_address}: {e}")
            raise
    
    async def authorize_device(self, mac_address: str, duration_hours: int = 24) -> Dict[str, Any]:
        """Authorize a device for internet access"""
        try:
            if not self.initialized:
                raise Exception("UniFi service not available")
            
            mac_address = self._normalize_mac(mac_address)
            
            # Calculate expiration time
            expires_at = datetime.now() + timedelta(hours=duration_hours)
            
            # Create guest authorization
            endpoint = f"/proxy/network/v2/api/site/{self.site}/cmd/stamgr"
            
            auth_data = {
                "cmd": "authorize-guest",
                "mac": mac_address,
                "minutes": duration_hours * 60,
                "up": 0,  # Upload limit (0 = unlimited)
                "down": 0,  # Download limit (0 = unlimited)
                "bytes": 0  # Total bytes limit (0 = unlimited)
            }
            
            result = await self._make_request("POST", endpoint, auth_data)
            
            logger.info(f"Device {mac_address} authorized for {duration_hours} hours")
            
            return {
                "authorized": True,
                "mac_address": mac_address,
                "duration_hours": duration_hours,
                "expires_at": expires_at.isoformat(),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to authorize device {mac_address}: {e}")
            raise
    
    async def get_device_status(self, mac_address: str) -> Dict[str, Any]:
        """Get device status and information"""
        try:
            if not self.initialized:
                return {
                    "found": False,
                    "error": "UniFi service not available"
                }
            
            mac_address = self._normalize_mac(mac_address)
            
            # Check active clients
            clients_endpoint = f"/proxy/network/v2/api/site/{self.site}/clients/active"
            active_clients = await self._make_request("GET", clients_endpoint)
            
            # Search for device in active clients
            device_info = None
            for client in active_clients.get("data", []):
                if client.get("mac", "").lower() == mac_address.lower():
                    device_info = client
                    break
            
            if device_info:
                return {
                    "found": True,
                    "mac_address": mac_address,
                    "is_online": True,
                    "ip_address": device_info.get("ip"),
                    "hostname": device_info.get("hostname", device_info.get("name")),
                    "is_guest": device_info.get("is_guest", False),
                    "last_seen": device_info.get("last_seen"),
                    "bytes_rx": device_info.get("rx_bytes", 0),
                    "bytes_tx": device_info.get("tx_bytes", 0),
                    "signal": device_info.get("signal"),
                    "ap_mac": device_info.get("ap_mac"),
                    "network": device_info.get("network"),
                    "timestamp": datetime.now().isoformat()
                }
            
            # Check historical clients if not found in active
            history_endpoint = f"/proxy/network/v2/api/site/{self.site}/clients/history"
            params = {"within": 24}  # Last 24 hours
            
            # Note: This endpoint may require additional parameters or different approach
            # depending on the UniFi controller version
            
            return {
                "found": False,
                "mac_address": mac_address,
                "is_online": False,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to get device status for {mac_address}: {e}")
            return {
                "found": False,
                "mac_address": mac_address,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    async def get_blocked_devices(self) -> List[Dict[str, Any]]:
        """Get list of blocked devices"""
        try:
            if not self.initialized:
                return []
            
            # Get firewall rules that block devices
            endpoint = f"/proxy/network/v2/api/site/{self.site}/firewallrules"
            rules = await self._make_request("GET", endpoint)
            
            blocked_devices = []
            
            for rule in rules.get("data", []):
                if (rule.get("action") == "drop" and 
                    rule.get("src_mac_address") and
                    rule.get("name", "").startswith("Block_")):
                    
                    blocked_devices.append({
                        "mac_address": rule.get("src_mac_address"),
                        "rule_id": rule.get("_id"),
                        "rule_name": rule.get("name"),
                        "enabled": rule.get("enabled", False),
                        "created": rule.get("attr_no_edit", {}).get("created_date"),
                        "note": rule.get("note", "")
                    })
            
            return blocked_devices
            
        except Exception as e:
            logger.error(f"Failed to get blocked devices: {e}")
            return []
    
    async def _disconnect_client(self, mac_address: str) -> bool:
        """Disconnect a client from the network"""
        try:
            endpoint = f"/proxy/network/v2/api/site/{self.site}/cmd/stamgr"
            
            disconnect_data = {
                "cmd": "kick-sta",
                "mac": mac_address
            }
            
            await self._make_request("POST", endpoint, disconnect_data)
            return True
            
        except Exception as e:
            logger.warning(f"Failed to disconnect client {mac_address}: {e}")
            return False
    
    def _normalize_mac(self, mac_address: str) -> str:
        """Normalize MAC address format"""
        if not mac_address:
            return ""
        
        # Remove any separators and convert to lowercase
        mac = mac_address.replace(":", "").replace("-", "").replace(".", "").lower()
        
        # Add colons in the standard format
        if len(mac) == 12:
            return ":".join([mac[i:i+2] for i in range(0, 12, 2)])
        
        return mac_address.lower()  # Return as-is if not 12 characters
    
    async def health_check(self) -> Dict[str, Any]:
        """Health check for UniFi service"""
        try:
            if not self.initialized:
                return {
                    "status": "unavailable",
                    "message": "Service not initialized"
                }
            
            # Try to make a simple API call
            endpoint = f"/proxy/network/v2/api/site/{self.site}/health"
            health_data = await self._make_request("GET", endpoint)
            
            return {
                "status": "healthy",
                "controller_url": self.base_url,
                "site": self.site,
                "last_auth": self.last_auth.isoformat() if self.last_auth else None,
                "subsystems": health_data.get("data", [])
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "controller_url": self.base_url
            }
    
    async def logout(self):
        """Logout from UniFi controller"""
        try:
            if self.session and self.base_url:
                logout_url = f"{self.base_url}/api/auth/logout"
                async with self.session.post(logout_url) as response:
                    logger.info("UniFi logout completed")
        except Exception as e:
            logger.warning(f"UniFi logout failed: {e}")
        finally:
            if self.session:
                await self.session.close()
                self.session = None
    
    async def get_site_info(self) -> Dict[str, Any]:
        """Get site information"""
        try:
            if not self.initialized:
                raise Exception("UniFi service not available")
            
            endpoint = f"/proxy/network/v2/api/site/{self.site}"
            site_data = await self._make_request("GET", endpoint)
            
            return site_data.get("data", [{}])[0] if site_data.get("data") else {}
            
        except Exception as e:
            logger.error(f"Failed to get site info: {e}")
            return {}
    
    async def get_network_stats(self) -> Dict[str, Any]:
        """Get network statistics"""
        try:
            if not self.initialized:
                raise Exception("UniFi service not available")
            
            # Get active clients count
            clients_endpoint = f"/proxy/network/v2/api/site/{self.site}/clients/active"
            clients_data = await self._make_request("GET", clients_endpoint)
            
            active_clients = len(clients_data.get("data", []))
            guest_clients = len([c for c in clients_data.get("data", []) if c.get("is_guest")])
            
            return {
                "active_clients": active_clients,
                "guest_clients": guest_clients,
                "authenticated_clients": active_clients - guest_clients,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to get network stats: {e}")
            return {
                "active_clients": 0,
                "guest_clients": 0,
                "authenticated_clients": 0,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }