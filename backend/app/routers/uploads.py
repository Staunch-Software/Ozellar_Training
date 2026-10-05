"""Uploads and media streaming router with HTTP Range header support."""
import re
import mimetypes
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app import storage

router = APIRouter(tags=["Uploads"])


@router.get("/api/uploads/{course_id}/{filename}")
def serve_upload(course_id: str, filename: str, request: Request):
    # Plain `def` on purpose: storage.get_size() is a blocking Azure round-trip.
    file_size = storage.get_size(course_id, filename)
    if file_size is None:
        raise HTTPException(status_code=404, detail="File not found")

    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = "application/octet-stream"

    range_header = request.headers.get("range")
    if range_header:
        # Parse Range: bytes=start-end
        range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
            end = min(end, file_size - 1)
            chunk_size = end - start + 1

            return StreamingResponse(
                storage.stream_range(course_id, filename, start, end),
                status_code=206,
                media_type=mime_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(chunk_size),
                    "Cache-Control": "public, max-age=3600",
                }
            )

    # No range header - serve entire file
    return StreamingResponse(
        storage.stream_full(course_id, filename),
        media_type=mime_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Cache-Control": "public, max-age=3600",
        }
    )
