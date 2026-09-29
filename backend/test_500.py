import requests

# We must send a file to test the upload endpoint, using a basic ZIP header so it passes python-magic validation
files = {'file': ('test.pptx', b'PK\x03\x04\x14\x00\x06\x00\x08\x00dummy content', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')}
# And we need to authenticate as admin
# We know admin email is admin@ozellarmarine.com, password Admin@123
res_login = requests.post("http://localhost:5173/api/auth/login", json={"email": "admin@ozellarmarine.com", "password": "Admin@123", "mode": "admin"})
if res_login.status_code != 200:
    print("Login failed:", res_login.status_code, res_login.text)
else:
    token = res_login.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    res_upload = requests.post("http://localhost:5173/api/admin/courses/mental-health-1/upload-pptx", files=files, headers=headers)
    print("Upload Status:", res_upload.status_code)
    print("Upload Response:", res_upload.text)
