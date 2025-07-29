from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import sys
import os

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.printer_service import PrinterService
from services.unifi_service import UniFiService
from services.email_service import EmailService
from models.requests import (
    PrintReceiptRequest,
    PrintVoucherRequest,
    BlockDeviceRequest,
    SendEmailRequest
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('../logs/python-services.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="LSLT WiFi Portal - Python Services",
    description="Microservices for printing, UniFi integration, and email services",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
printer_service = PrinterService()
unifi_service = UniFiService()
email_service = EmailService()

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    try:
        logger.info("Starting LSLT Python microservices...")
        
        # Initialize printer service
        await printer_service.initialize()
        
        # Initialize UniFi service
        await unifi_service.initialize()
        
        # Initialize email service
        await email_service.initialize()
        
        logger.info("All services initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Python microservices...")
    
    try:
        await unifi_service.logout()
        logger.info("UniFi service logged out")
    except Exception as e:
        logger.error(f"Error during UniFi logout: {e}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "services": {
            "printer": await printer_service.health_check(),
            "unifi": await unifi_service.health_check(),
            "email": await email_service.health_check()
        }
    }

# Printer endpoints
@app.post("/print/receipt")
async def print_receipt(request: PrintReceiptRequest, background_tasks: BackgroundTasks):
    """Print a receipt on 80mm thermal printer"""
    try:
        result = await printer_service.print_receipt(
            voucher_data=request.voucher_data,
            customer_data=request.customer_data,
            staff_data=request.staff_data,
            site_data=request.site_data
        )
        return {"success": True, "message": "Receipt printed successfully", "job_id": result}
    except Exception as e:
        logger.error(f"Receipt printing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/print/voucher")
async def print_voucher(request: PrintVoucherRequest, background_tasks: BackgroundTasks):
    """Print a voucher with QR code"""
    try:
        result = await printer_service.print_voucher(
            voucher_data=request.voucher_data,
            print_type=request.print_type
        )
        return {"success": True, "message": "Voucher printed successfully", "job_id": result}
    except Exception as e:
        logger.error(f"Voucher printing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/print/report")
async def print_report(report_data: dict, background_tasks: BackgroundTasks):
    """Print a report on A4 printer"""
    try:
        result = await printer_service.print_report(report_data)
        return {"success": True, "message": "Report printed successfully", "job_id": result}
    except Exception as e:
        logger.error(f"Report printing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/print/status")
async def get_printer_status():
    """Get status of all configured printers"""
    try:
        status = await printer_service.get_printer_status()
        return {"success": True, "printers": status}
    except Exception as e:
        logger.error(f"Failed to get printer status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/print/test/{printer_id}")
async def test_printer(printer_id: str):
    """Test a specific printer"""
    try:
        result = await printer_service.test_printer(printer_id)
        return {"success": True, "message": "Test print completed", "result": result}
    except Exception as e:
        logger.error(f"Printer test failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# UniFi endpoints
@app.post("/unifi/block-device")
async def block_device(request: BlockDeviceRequest):
    """Block a device via UniFi UDM"""
    try:
        result = await unifi_service.block_device(
            mac_address=request.mac_address,
            reason=request.reason
        )
        return {"success": True, "message": "Device blocked successfully", "result": result}
    except Exception as e:
        logger.error(f"Device blocking failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/unifi/unblock-device")
async def unblock_device(mac_address: str):
    """Unblock a device via UniFi UDM"""
    try:
        result = await unifi_service.unblock_device(mac_address)
        return {"success": True, "message": "Device unblocked successfully", "result": result}
    except Exception as e:
        logger.error(f"Device unblocking failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/unifi/authorize-device")
async def authorize_device(mac_address: str, duration_hours: int = 24):
    """Authorize a device for internet access"""
    try:
        result = await unifi_service.authorize_device(mac_address, duration_hours)
        return {"success": True, "message": "Device authorized successfully", "result": result}
    except Exception as e:
        logger.error(f"Device authorization failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/unifi/device-status/{mac_address}")
async def get_device_status(mac_address: str):
    """Get device status from UniFi controller"""
    try:
        status = await unifi_service.get_device_status(mac_address)
        return {"success": True, "device_status": status}
    except Exception as e:
        logger.error(f"Failed to get device status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/unifi/blocked-devices")
async def get_blocked_devices():
    """Get list of blocked devices"""
    try:
        devices = await unifi_service.get_blocked_devices()
        return {"success": True, "blocked_devices": devices}
    except Exception as e:
        logger.error(f"Failed to get blocked devices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Email endpoints
@app.post("/email/send")
async def send_email(request: SendEmailRequest, background_tasks: BackgroundTasks):
    """Send a generic email"""
    try:
        background_tasks.add_task(
            email_service.send_email,
            to_email=request.to_email,
            subject=request.subject,
            template_name=request.template_name,
            template_data=request.template_data,
            attachments=request.attachments
        )
        return {"success": True, "message": "Email queued for sending"}
    except Exception as e:
        logger.error(f"Email sending failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/email/send-voucher")
async def send_voucher_email(voucher_data: dict, customer_email: str, background_tasks: BackgroundTasks):
    """Send voucher email to customer"""
    try:
        background_tasks.add_task(
            email_service.send_voucher_email,
            voucher_data=voucher_data,
            customer_email=customer_email
        )
        return {"success": True, "message": "Voucher email queued for sending"}
    except Exception as e:
        logger.error(f"Voucher email sending failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/email/send-campaign")
async def send_campaign_email(campaign_data: dict, recipient_list: list, background_tasks: BackgroundTasks):
    """Send marketing campaign email"""
    try:
        background_tasks.add_task(
            email_service.send_campaign_email,
            campaign_data=campaign_data,
            recipient_list=recipient_list
        )
        return {"success": True, "message": "Campaign emails queued for sending"}
    except Exception as e:
        logger.error(f"Campaign email sending failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )