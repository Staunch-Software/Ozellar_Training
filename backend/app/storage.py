"""Storage backend for admin course-builder uploads (slide images, videos).

Selects Azure Blob Storage when AZURE_STORAGE_CONNECTION_STRING and
AZURE_CONTAINER_NAME are both set, otherwise falls back to the local
`UPLOAD_DIR` on disk — mirrors the DATABASE_URL fallback pattern used
elsewhere in this app (unset -> SQLite, set -> Postgres).

Callers address files by (course_id, filename); this module hides whether
that maps to a local path or a blob named "{course_id}/{filename}".
"""
import os
from typing import Iterator, Optional

UPLOAD_DIR = os.getenv(
    "UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

_AZURE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
_AZURE_CONTAINER = os.getenv("AZURE_CONTAINER_NAME")
_USE_AZURE = bool(_AZURE_CONN_STR and _AZURE_CONTAINER)

_container_client = None
if _USE_AZURE:
    from azure.storage.blob import BlobServiceClient
    _blob_service = BlobServiceClient.from_connection_string(_AZURE_CONN_STR)
    _container_client = _blob_service.get_container_client(_AZURE_CONTAINER)
    print(f"[storage] Using Azure Blob Storage (container={_AZURE_CONTAINER})")
else:
    print(f"[storage] Using local disk storage (UPLOAD_DIR={UPLOAD_DIR})")


def _blob_name(course_id: str, filename: str) -> str:
    return f"{course_id}/{filename}"


def _local_path(course_id: str, filename: str) -> str:
    return os.path.join(UPLOAD_DIR, course_id, filename)


def save(course_id: str, filename: str, local_path: str) -> None:
    """Move a locally-written file into the active backend."""
    if _USE_AZURE:
        blob_client = _container_client.get_blob_client(_blob_name(course_id, filename))
        with open(local_path, "rb") as f:
            blob_client.upload_blob(f, overwrite=True)
        os.remove(local_path)
    else:
        dest = _local_path(course_id, filename)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        os.replace(local_path, dest)


def exists(course_id: str, filename: str) -> bool:
    if _USE_AZURE:
        return _container_client.get_blob_client(_blob_name(course_id, filename)).exists()
    return os.path.isfile(_local_path(course_id, filename))


def get_size(course_id: str, filename: str) -> Optional[int]:
    if _USE_AZURE:
        blob_client = _container_client.get_blob_client(_blob_name(course_id, filename))
        try:
            return blob_client.get_blob_properties().size
        except Exception:
            return None
    path = _local_path(course_id, filename)
    return os.path.getsize(path) if os.path.isfile(path) else None


def delete(course_id: str, filename: str) -> None:
    if _USE_AZURE:
        try:
            _container_client.get_blob_client(_blob_name(course_id, filename)).delete_blob()
        except Exception:
            pass
    else:
        try:
            os.remove(_local_path(course_id, filename))
        except OSError:
            pass


def stream_range(course_id: str, filename: str, start: int, end: int, chunk_size_bytes: int = 65536) -> Iterator[bytes]:
    """Yield bytes [start, end] inclusive."""
    length = end - start + 1
    if _USE_AZURE:
        blob_client = _container_client.get_blob_client(_blob_name(course_id, filename))
        downloader = blob_client.download_blob(offset=start, length=length)
        for chunk in downloader.chunks():
            yield chunk
    else:
        with open(_local_path(course_id, filename), "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                data = f.read(min(chunk_size_bytes, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data


def stream_full(course_id: str, filename: str, chunk_size_bytes: int = 65536) -> Iterator[bytes]:
    if _USE_AZURE:
        blob_client = _container_client.get_blob_client(_blob_name(course_id, filename))
        for chunk in blob_client.download_blob().chunks():
            yield chunk
    else:
        with open(_local_path(course_id, filename), "rb") as f:
            while True:
                data = f.read(chunk_size_bytes)
                if not data:
                    break
                yield data
