import os
try:
    import magic
    HAS_MAGIC = True
except ImportError:
    import mimetypes
    import warnings
    warnings.warn("libmagic not found. Falling back to basic mimetypes validation for Layer 1. Install python-magic-bin on Windows or libmagic on Linux.")
    HAS_MAGIC = False

import pyclamd
from fastapi import UploadFile, HTTPException, status
import logging

logger = logging.getLogger(__name__)

# Define safe MIME types based on the project's expected uploads
# Modify this list if additional file types are required
SAFE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "text/plain",
    "text/csv",
    "video/mp4",
    "video/webm",
    "video/quicktime"
}

# Optional: Add safe extensions map for basic cross-checking
SAFE_EXTENSIONS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime"
}

def get_clamd_scanner():
    """Attempt to connect to a local ClamAV daemon."""
    try:
        # Try connecting via unix socket first (Linux/Mac)
        cd = pyclamd.ClamdUnixSocket()
        if cd.ping():
            return cd
    except Exception:
        pass
    
    try:
        # Fallback to network socket (Windows/Docker)
        cd = pyclamd.ClamdNetworkSocket()
        if cd.ping():
            return cd
    except Exception:
        pass
        
    return None

async def validate_safe_upload(file: UploadFile) -> None:
    """
    Validates that an uploaded file is safe to store.
    Layer 1: Verifies file extension and MIME type using python-magic.
    Layer 2: Scans file with ClamAV if the daemon is available.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    # 1. Extension check
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in SAFE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"File extension {ext} is not allowed."
        )

    # 2. Magic MIME Type validation (Layer 1)
    # Read the first 2048 bytes for magic number detection
    header_chunk = await file.read(2048)
    if not header_chunk:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    if HAS_MAGIC:
        try:
            mime_type = magic.from_buffer(header_chunk, mime=True)
        except Exception as e:
            logger.error(f"Error reading file magic: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not determine file type")
    else:
        mime_type, _ = mimetypes.guess_type(file.filename)
        if not mime_type:
            mime_type = "application/octet-stream"
    
    if mime_type not in SAFE_MIME_TYPES:
        logger.warning(f"Blocked upload: {file.filename} with actual MIME type {mime_type}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"File type {mime_type} is not allowed or matches malicious signature."
        )

    # Reset file cursor before ClamAV scan
    await file.seek(0)

    # 3. ClamAV Scan (Layer 2)
    scanner = get_clamd_scanner()
    if scanner:
        try:
            # We must pass the entire stream or read it into memory. 
            # For large files, saving to a temporary file is better, but stream is okay for general attachments.
            file_content = await file.read()
            scan_result = scanner.scan_stream(file_content)
            
            if scan_result is not None:
                logger.warning(f"ClamAV detected virus in {file.filename}: {scan_result}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail="File upload blocked: Virus detected by ClamAV."
                )
        except pyclamd.BufferTooLongError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="File is too large for virus scanning."
            )
        except Exception as e:
            # If scan fails, log it but don't crash, allowing fallback to Layer 1.
            if not isinstance(e, HTTPException):
                logger.warning(f"ClamAV scan failed during stream read: {e}")
        finally:
            await file.seek(0)
    else:
        logger.info("ClamAV daemon not found, relying on Layer 1 (MIME type) validation.")

    # Final reset just in case
    await file.seek(0)
