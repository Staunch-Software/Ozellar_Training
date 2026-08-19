import argparse
import os
import sys
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient

# Load environment variables
load_dotenv()

from app.video import compress_video

AZURE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
CONTAINER_NAME = os.getenv("AZURE_CONTAINER_NAME")

if not AZURE_CONNECTION_STRING or not CONTAINER_NAME:
    print("Error: AZURE_STORAGE_CONNECTION_STRING and AZURE_CONTAINER_NAME must be set in .env")
    sys.exit(1)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "uploads"))

def migrate(delete_after_upload: bool):
    print(f"Connecting to Azure Blob Storage...")
    blob_service_client = BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)

    # Ensure container exists
    container_client = blob_service_client.get_container_client(CONTAINER_NAME)
    if not container_client.exists():
        print(f"Container '{CONTAINER_NAME}' does not exist. Please create it first.")
        sys.exit(1)

    print(f"Starting migration from {UPLOAD_DIR} to container '{CONTAINER_NAME}'...")
    if delete_after_upload:
        print("--delete-after-upload is set: local files will be removed once verified in Azure.")

    total_files = 0
    uploaded_files = 0
    deleted_files = 0

    for root, dirs, files in os.walk(UPLOAD_DIR):
        if root == UPLOAD_DIR:
            # "photos/" (crew ID photos) is read directly off local disk by
            # certificate generation, never through the Azure storage backend
            # — leave it alone. "tmp_*" dirs are transient PPTX-conversion
            # scratch space that gets cleaned up on its own.
            dirs[:] = [d for d in dirs if d != "photos" and not d.startswith("tmp_")]
        for file in files:
            if file.startswith("_upload_") or file.endswith(".compressed.mp4"):
                # In-progress or crashed-mid-compression scratch file — not a
                # finished upload, skip it (it'll be cleaned up or retried by
                # the app itself).
                continue
            total_files += 1
            local_path = os.path.join(root, file)
            # Calculate relative path to use as blob name
            # E.g., uploads/course_id/video.mp4 -> course_id/video.mp4
            blob_name = os.path.relpath(local_path, UPLOAD_DIR).replace("\\", "/")

            blob_client = blob_service_client.get_blob_client(container=CONTAINER_NAME, blob=blob_name)
            is_video = file.lower().endswith(".mp4")

            if delete_after_upload and is_video:
                # Committing: always (re)compress and overwrite, even if an
                # earlier dry run already uploaded an uncompressed copy of
                # this file — a plain dry run never compresses (see below),
                # so an existing blob at this point is still the raw original.
                upload_path = compress_video(local_path)  # deletes local_path on success
                print(f"Uploading (compressed) {blob_name}...")
                try:
                    with open(upload_path, "rb") as data:
                        blob_client.upload_blob(data, overwrite=True)
                    uploaded_files += 1
                    already_uploaded = True
                except Exception as e:
                    print(f"Failed to upload {blob_name}: {e}")
                    already_uploaded = False
            else:
                already_uploaded = blob_client.exists()
                upload_path = local_path
                if already_uploaded:
                    print(f"Skipping {blob_name}, already exists in Azure.")
                else:
                    print(f"Uploading {blob_name}...")
                    try:
                        with open(local_path, "rb") as data:
                            blob_client.upload_blob(data)
                        uploaded_files += 1
                        already_uploaded = True
                    except Exception as e:
                        print(f"Failed to upload {blob_name}: {e}")
                        already_uploaded = False

            if delete_after_upload and already_uploaded:
                # Verify the blob's size matches what we just uploaded before
                # deleting — never delete on a partial/failed upload.
                local_size = os.path.getsize(upload_path)
                try:
                    remote_size = blob_client.get_blob_properties().size
                except Exception as e:
                    print(f"Could not verify {blob_name} before delete, leaving local copy: {e}")
                    continue
                if remote_size != local_size:
                    print(f"Size mismatch for {blob_name} (local={local_size}, remote={remote_size}), leaving local copy.")
                    continue
                try:
                    os.remove(upload_path)
                    deleted_files += 1
                except OSError as e:
                    print(f"Failed to delete local file {upload_path}: {e}")

    print(f"Migration complete! Uploaded {uploaded_files} of {total_files} files.")
    if delete_after_upload:
        print(f"Deleted {deleted_files} local files after verified upload.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate backend/uploads to Azure Blob Storage.")
    parser.add_argument(
        "--delete-after-upload", action="store_true",
        help="Delete each local file once its upload is verified in Azure (frees VM disk space). "
             "Off by default — run once without this flag first to confirm the migration looks right.")
    args = parser.parse_args()
    migrate(delete_after_upload=args.delete_after_upload)
