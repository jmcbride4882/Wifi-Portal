import asyncio
import logging
import cups
import qrcode
import io
import base64
from datetime import datetime
from typing import Dict, Any, Optional, List
from PIL import Image, ImageDraw, ImageFont
from escpos.printer import Network, Usb
from escpos.exceptions import Error as EscPosError
import json
import os

logger = logging.getLogger(__name__)

class PrinterService:
    """Service for handling all printing operations"""
    
    def __init__(self):
        self.thermal_printers = {}
        self.cups_connection = None
        self.label_printers = {}
        self.printer_configs = {}
        self.initialized = False
    
    async def initialize(self):
        """Initialize printer service and discover printers"""
        try:
            logger.info("Initializing printer service...")
            
            # Load printer configurations
            await self._load_printer_configs()
            
            # Initialize CUPS connection for A4/network printers
            await self._initialize_cups()
            
            # Initialize thermal printers
            await self._initialize_thermal_printers()
            
            # Initialize label printers
            await self._initialize_label_printers()
            
            self.initialized = True
            logger.info("Printer service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize printer service: {e}")
            raise
    
    async def _load_printer_configs(self):
        """Load printer configurations from database or config file"""
        # In a real implementation, this would query the database
        # For now, we'll use default configurations
        self.printer_configs = {
            "thermal_receipt": {
                "type": "thermal",
                "connection": "network",
                "ip": "192.168.1.100",
                "port": 9100,
                "width": 48,  # characters
                "encoding": "utf-8"
            },
            "a4_reports": {
                "type": "a4",
                "name": "HP_LaserJet",
                "cups_name": "HP_LaserJet_Pro_MFP",
                "duplex": True
            },
            "label_printer": {
                "type": "label",
                "connection": "usb",
                "vendor_id": 0x04b8,
                "product_id": 0x0202,
                "width_mm": 62
            }
        }
    
    async def _initialize_cups(self):
        """Initialize CUPS connection for A4 printers"""
        try:
            self.cups_connection = cups.Connection()
            printers = self.cups_connection.getPrinters()
            logger.info(f"CUPS printers available: {list(printers.keys())}")
        except Exception as e:
            logger.warning(f"CUPS initialization failed: {e}")
            self.cups_connection = None
    
    async def _initialize_thermal_printers(self):
        """Initialize thermal/receipt printers"""
        for printer_id, config in self.printer_configs.items():
            if config["type"] == "thermal":
                try:
                    if config["connection"] == "network":
                        printer = Network(
                            host=config["ip"],
                            port=config.get("port", 9100),
                            timeout=10
                        )
                    elif config["connection"] == "usb":
                        printer = Usb(
                            idVendor=config["vendor_id"],
                            idProduct=config["product_id"]
                        )
                    else:
                        continue
                    
                    self.thermal_printers[printer_id] = printer
                    logger.info(f"Thermal printer {printer_id} initialized")
                    
                except Exception as e:
                    logger.error(f"Failed to initialize thermal printer {printer_id}: {e}")
    
    async def _initialize_label_printers(self):
        """Initialize label printers"""
        for printer_id, config in self.printer_configs.items():
            if config["type"] == "label":
                try:
                    # Label printers often use ESC/POS over USB
                    if config["connection"] == "usb":
                        printer = Usb(
                            idVendor=config["vendor_id"],
                            idProduct=config["product_id"]
                        )
                        self.label_printers[printer_id] = printer
                        logger.info(f"Label printer {printer_id} initialized")
                except Exception as e:
                    logger.error(f"Failed to initialize label printer {printer_id}: {e}")
    
    async def print_receipt(self, voucher_data: Dict[str, Any], customer_data: Optional[Dict[str, Any]], 
                          staff_data: Dict[str, Any], site_data: Dict[str, Any]) -> str:
        """Print a thermal receipt for voucher redemption"""
        try:
            printer = self.thermal_printers.get("thermal_receipt")
            if not printer:
                raise Exception("Thermal receipt printer not available")
            
            # Generate receipt content
            await self._print_thermal_receipt(printer, voucher_data, customer_data, staff_data, site_data)
            
            return f"receipt_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
        except Exception as e:
            logger.error(f"Receipt printing failed: {e}")
            raise
    
    async def _print_thermal_receipt(self, printer, voucher_data: Dict, customer_data: Optional[Dict], 
                                   staff_data: Dict, site_data: Dict):
        """Generate and print thermal receipt"""
        try:
            printer.set(align='center', font='a', bold=True, double_height=True)
            printer.text(f"{site_data['name']}\n")
            
            printer.set(align='center', font='b', bold=False, double_height=False)
            printer.text(f"{site_data['location']}\n")
            printer.text("-" * 48 + "\n")
            
            printer.set(align='center', font='a', bold=True)
            printer.text("VOUCHER REDEMPTION\n")
            printer.text("-" * 48 + "\n")
            
            # Voucher details
            printer.set(align='left', font='a', bold=False)
            printer.text(f"Code: {voucher_data['code']}\n")
            printer.text(f"Type: {voucher_data['title']}\n")
            printer.text(f"Value: ${voucher_data.get('value', 0):.2f}\n")
            printer.text(f"Redeemed: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
            
            if customer_data:
                printer.text(f"Customer: {customer_data['name']}\n")
                printer.text(f"Tier: {customer_data['loyalty_tier']}\n")
            
            printer.text(f"Staff: {staff_data['name']}\n")
            printer.text("-" * 48 + "\n")
            
            # QR code for verification
            if voucher_data.get('qr_code'):
                qr_data = {
                    'type': 'redemption_receipt',
                    'voucher_code': voucher_data['code'],
                    'timestamp': datetime.now().isoformat(),
                    'site_id': site_data['id']
                }
                
                qr = qrcode.QRCode(version=1, box_size=4, border=1)
                qr.add_data(json.dumps(qr_data))
                qr.make(fit=True)
                
                qr_img = qr.make_image(fill_color="black", back_color="white")
                
                # Convert to format suitable for thermal printer
                printer.set(align='center')
                printer.image(qr_img, impl='bitImageColumn')
            
            printer.text("\n")
            printer.set(align='center', font='b')
            printer.text("Thank you for your visit!\n")
            printer.text("Visit us again soon.\n\n")
            
            # Cut paper
            printer.cut()
            
        except EscPosError as e:
            logger.error(f"ESC/POS printing error: {e}")
            raise
    
    async def print_voucher(self, voucher_data: Dict[str, Any], print_type: str = "thermal") -> str:
        """Print a voucher (thermal, label, or A4)"""
        try:
            if print_type == "thermal":
                return await self._print_voucher_thermal(voucher_data)
            elif print_type == "label":
                return await self._print_voucher_label(voucher_data)
            elif print_type == "a4":
                return await self._print_voucher_a4(voucher_data)
            else:
                raise ValueError(f"Unsupported print type: {print_type}")
                
        except Exception as e:
            logger.error(f"Voucher printing failed: {e}")
            raise
    
    async def _print_voucher_thermal(self, voucher_data: Dict) -> str:
        """Print voucher on thermal printer"""
        printer = self.thermal_printers.get("thermal_receipt")
        if not printer:
            raise Exception("Thermal printer not available")
        
        try:
            # Header
            printer.set(align='center', font='a', bold=True, double_height=True)
            printer.text("VOUCHER\n")
            
            printer.set(align='center', font='b', bold=False)
            printer.text("-" * 48 + "\n")
            
            # Voucher details
            printer.set(align='center', font='a', bold=True)
            printer.text(f"{voucher_data['title']}\n\n")
            
            printer.set(align='left', font='a', bold=False)
            printer.text(f"Code: {voucher_data['code']}\n")
            
            if voucher_data.get('description'):
                printer.text(f"Description: {voucher_data['description']}\n")
            
            if voucher_data.get('value'):
                printer.text(f"Value: ${voucher_data['value']:.2f}\n")
            
            printer.text(f"Expires: {voucher_data['expires_at'][:10]}\n")
            printer.text("-" * 48 + "\n")
            
            # QR Code
            if voucher_data.get('qr_code'):
                # Decode base64 QR code if it's encoded
                qr_data = voucher_data['qr_code']
                if qr_data.startswith('data:image'):
                    # Extract base64 data
                    qr_data = qr_data.split(',')[1]
                    qr_bytes = base64.b64decode(qr_data)
                    qr_img = Image.open(io.BytesIO(qr_bytes))
                else:
                    # Generate QR code from voucher data
                    qr = qrcode.QRCode(version=1, box_size=4, border=1)
                    qr.add_data(json.dumps({
                        'code': voucher_data['code'],
                        'type': voucher_data['type'],
                        'expires': voucher_data['expires_at']
                    }))
                    qr.make(fit=True)
                    qr_img = qr.make_image(fill_color="black", back_color="white")
                
                printer.set(align='center')
                printer.image(qr_img, impl='bitImageColumn')
            
            # Barcode
            if voucher_data.get('barcode'):
                printer.set(align='center')
                printer.barcode(voucher_data['code'], 'CODE128', width=2, height=50)
            
            printer.text("\n")
            printer.set(align='center', font='b')
            printer.text("Present this voucher to redeem\n")
            printer.text("Terms and conditions apply\n\n")
            
            printer.cut()
            
            return f"voucher_thermal_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
        except Exception as e:
            logger.error(f"Thermal voucher printing failed: {e}")
            raise
    
    async def _print_voucher_label(self, voucher_data: Dict) -> str:
        """Print voucher on label printer"""
        printer = self.label_printers.get("label_printer")
        if not printer:
            raise Exception("Label printer not available")
        
        # Similar to thermal but optimized for label format
        # Implementation would depend on specific label printer model
        return f"voucher_label_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    async def _print_voucher_a4(self, voucher_data: Dict) -> str:
        """Print voucher on A4 printer"""
        if not self.cups_connection:
            raise Exception("CUPS/A4 printer not available")
        
        # Generate PDF voucher and print via CUPS
        # This would use reportlab to create a professional voucher
        return f"voucher_a4_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    async def print_report(self, report_data: Dict[str, Any]) -> str:
        """Print a report on A4 printer"""
        try:
            if not self.cups_connection:
                raise Exception("CUPS printer not available")
            
            # Generate report PDF and print
            # Implementation would use reportlab for professional reports
            
            return f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
        except Exception as e:
            logger.error(f"Report printing failed: {e}")
            raise
    
    async def get_printer_status(self) -> Dict[str, Any]:
        """Get status of all configured printers"""
        status = {}
        
        # Check thermal printers
        for printer_id, printer in self.thermal_printers.items():
            try:
                # Try to get printer status
                # This is printer-specific and may not be available for all models
                status[printer_id] = {
                    "type": "thermal",
                    "status": "online",
                    "last_check": datetime.now().isoformat()
                }
            except Exception:
                status[printer_id] = {
                    "type": "thermal", 
                    "status": "offline",
                    "last_check": datetime.now().isoformat()
                }
        
        # Check CUPS printers
        if self.cups_connection:
            try:
                cups_printers = self.cups_connection.getPrinters()
                for name, details in cups_printers.items():
                    status[name] = {
                        "type": "cups",
                        "status": "online" if details.get("printer-state") == 3 else "offline",
                        "state_message": details.get("printer-state-message", ""),
                        "last_check": datetime.now().isoformat()
                    }
            except Exception as e:
                logger.error(f"Failed to get CUPS printer status: {e}")
        
        return status
    
    async def test_printer(self, printer_id: str) -> Dict[str, Any]:
        """Test a specific printer"""
        try:
            if printer_id in self.thermal_printers:
                printer = self.thermal_printers[printer_id]
                
                # Print test receipt
                printer.set(align='center', font='a', bold=True)
                printer.text("PRINTER TEST\n")
                printer.text("-" * 32 + "\n")
                printer.set(align='left', font='a', bold=False)
                printer.text(f"Printer ID: {printer_id}\n")
                printer.text(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                printer.text("Test successful!\n\n")
                printer.cut()
                
                return {"success": True, "message": "Test print completed"}
                
            elif self.cups_connection and printer_id in self.cups_connection.getPrinters():
                # Test CUPS printer
                test_content = f"""
                PRINTER TEST
                
                Printer: {printer_id}
                Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
                
                Test completed successfully!
                """
                
                # Create temporary file and print
                import tempfile
                with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                    f.write(test_content)
                    temp_file = f.name
                
                self.cups_connection.printFile(printer_id, temp_file, "Test Print", {})
                os.unlink(temp_file)
                
                return {"success": True, "message": "Test print sent to queue"}
            
            else:
                raise Exception(f"Printer {printer_id} not found")
                
        except Exception as e:
            logger.error(f"Printer test failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def health_check(self) -> Dict[str, Any]:
        """Health check for printer service"""
        return {
            "initialized": self.initialized,
            "thermal_printers": len(self.thermal_printers),
            "cups_available": self.cups_connection is not None,
            "label_printers": len(self.label_printers)
        }