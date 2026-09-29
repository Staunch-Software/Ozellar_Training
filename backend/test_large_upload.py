import requests
import os

# Create a dummy 200MB file with a basic ZIP header so it passes python-magic validation
dummy_file = "large_dummy.pptx"
with open(dummy_file, "wb") as f:
    f.write(b'PK\x03\x04\x14\x00\x06\x00\x08\x00')
    f.write(os.urandom(200 * 1024 * 1024 - 8))

print("Created 200MB file. Logging in...")

res_login = requests.post("http://localhost:5173/api/auth/login", json={"email": "admin@ozellarmarine.com", "password": "Admin@123", "mode": "admin"})
if res_login.status_code != 200:
    print("Login failed:", res_login.status_code, res_login.text)
else:
    token = res_login.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    print("Uploading...")
    with open(dummy_file, "rb") as f:
        files = {'file': ('large_dummy.pptx', f, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')}
        res_upload = requests.post("http://localhost:5173/api/admin/courses/mental-health-1/upload-pptx", files=files, headers=headers)
        print("Upload Status:", res_upload.status_code)
        print("Upload Response:", res_upload.text)

# Cleanup
os.remove(dummy_file)
