from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

class PrintReceiptRequest(BaseModel):
    """Request model for printing receipts"""
    voucher_data: Dict[str, Any]
    customer_data: Optional[Dict[str, Any]] = None
    staff_data: Dict[str, Any]
    site_data: Dict[str, Any]

class PrintVoucherRequest(BaseModel):
    """Request model for printing vouchers"""
    voucher_data: Dict[str, Any]
    print_type: str = "thermal"  # thermal, label, a4

class BlockDeviceRequest(BaseModel):
    """Request model for blocking devices"""
    mac_address: str
    reason: str
    duration_hours: Optional[int] = None

class SendEmailRequest(BaseModel):
    """Request model for sending emails"""
    to_email: EmailStr
    subject: str
    template_name: str
    template_data: Dict[str, Any]
    attachments: Optional[List[str]] = None

class VoucherData(BaseModel):
    """Voucher data structure"""
    id: int
    code: str
    type: str
    title: str
    description: Optional[str]
    value: Optional[float]
    qr_code: Optional[str]
    barcode: Optional[str]
    expires_at: datetime
    status: str

class CustomerData(BaseModel):
    """Customer data structure"""
    id: int
    name: str
    email: EmailStr
    loyalty_tier: str
    visit_count: int

class StaffData(BaseModel):
    """Staff data structure"""
    id: int
    name: str
    email: EmailStr
    role: str

class SiteData(BaseModel):
    """Site data structure"""
    id: int
    name: str
    location: str
    branding: Dict[str, Any]

class CampaignData(BaseModel):
    """Campaign data structure"""
    id: int
    name: str
    type: str
    content: Dict[str, Any]
    target_segment: Dict[str, Any]