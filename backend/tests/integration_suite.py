"""End-to-end API suite run against a live server (e.g. `docker compose up`).

    python backend/tests/integration_suite.py
    API_BASE_URL=https://<host>/api python backend/tests/integration_suite.py

Covers registration/login, upload, division isolation, the cross-division
access-request workflow, search and the metadata schema endpoint.  Writes
integration_report.txt in the current directory.
"""
import requests
import os
import json
import time

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:5000/api").rstrip("/")
REPORT_FILE = "integration_report.txt"

results = {"total": 0, "passed": 0, "failed": 0, "errors": []}

def log_result(test_name, success, error_msg=""):
    results["total"] += 1
    if success:
        results["passed"] += 1
        print(f"  [PASS] {test_name}")
    else:
        results["failed"] += 1
        print(f"  [FAIL] {test_name}: {error_msg}")
        results["errors"].append(f"[{test_name}] FAILED: {error_msg}")

def ensure_test_pdf():
    if not os.path.exists("test_sample.pdf"):
        with open("test_sample.pdf", "wb") as f:
            f.write(b"%PDF-1.4\n%" + b"A" * 1024 + b"\n%%EOF")

def test_document_upload(token):
    url = f"{BASE_URL}/documents/upload"
    ensure_test_pdf()

    try:
        with open("test_sample.pdf", "rb") as f:
            files = {"file": ("test_sample.pdf", f, "application/pdf")}
            data = {"metadata": json.dumps({"Division": "Division A", "Report Type": "Financial"})}
            response = requests.post(url, files=files, data=data, headers={"Authorization": f"Bearer {token}"})
            
            if response.status_code in [200, 201]:
                res_data = response.json()
                doc_id = res_data.get("document", {}).get("id")
                log_result("POST /api/documents/upload", True)
                return doc_id
            else:
                log_result("POST /api/documents/upload", False, f"Expected 200/201, got {response.status_code}. Response: {response.text}")
                return None
    except requests.exceptions.ConnectionError:
        log_result("POST /api/documents/upload", False, "Connection Refused. Is the Flask server running on port 5000?")
        return None
    except Exception as e:
        log_result("POST /api/documents/upload", False, str(e))
        return None

def test_authentication():
    # 1. Register User in Division A
    ts = int(time.time())
    user_a = {
        "username": f"alice_{ts}",
        "email": f"alice_{ts}@triad.ai",
        "password": "Password123!",
        "division": "Division A"
    }
    
    token_a = None
    try:
        reg_res = requests.post(f"{BASE_URL}/auth/register", json=user_a)
        if reg_res.status_code in [200, 201]:
            token_a = reg_res.json().get("token")
            log_result("POST /api/auth/register (User Division A)", True)
        else:
            log_result("POST /api/auth/register (User Division A)", False, f"Status: {reg_res.status_code}, {reg_res.text}")
    except Exception as e:
        log_result("POST /api/auth/register (User Division A)", False, str(e))

    # 2. Login User
    try:
        login_res = requests.post(f"{BASE_URL}/auth/login", json={
            "identifier": user_a["email"],
            "password": user_a["password"]
        })
        if login_res.status_code == 200 and "token" in login_res.json():
            token_a = login_res.json()["token"]
            log_result("POST /api/auth/login", True)
        else:
            log_result("POST /api/auth/login", False, f"Status: {login_res.status_code}, {login_res.text}")
    except Exception as e:
        log_result("POST /api/auth/login", False, str(e))

    # 3. Register User in Division B
    user_b = {
        "username": f"bob_{ts}",
        "email": f"bob_{ts}@triad.ai",
        "password": "Password123!",
        "division": "Division B"
    }
    token_b = None
    try:
        reg_b = requests.post(f"{BASE_URL}/auth/register", json=user_b)
        if reg_b.status_code in [200, 201]:
            token_b = reg_b.json().get("token")
            log_result("POST /api/auth/register (User Division B)", True)
        else:
            log_result("POST /api/auth/register (User Division B)", False, f"Status: {reg_b.status_code}, {reg_b.text}")
    except Exception as e:
        log_result("POST /api/auth/register (User Division B)", False, str(e))

    return token_a, token_b

def test_rbac_isolation(token_a, token_b):
    ensure_test_pdf()
    headers_a = {"Authorization": f"Bearer {token_a}"} if token_a else {}
    headers_b = {"Authorization": f"Bearer {token_b}"} if token_b else {}

    # 1. User A uploads doc for Division A (Allowed)
    doc_a_id = None
    try:
        with open("test_sample.pdf", "rb") as f:
            files = {"file": ("division_a_doc.pdf", f, "application/pdf")}
            data = {"metadata": json.dumps({"Division": "Division A", "Report Type": "Financial"})}
            res = requests.post(f"{BASE_URL}/documents/upload", files=files, data=data, headers=headers_a)
            if res.status_code in [200, 201]:
                doc_a_id = res.json().get("document", {}).get("id")
                log_result("RBAC: Division A user uploads to Division A (Allowed)", True)
            else:
                log_result("RBAC: Division A user uploads to Division A (Allowed)", False, res.text)
    except Exception as e:
        log_result("RBAC: Division A user uploads to Division A (Allowed)", False, str(e))

    # 2. User A tries to upload document tagged for Division B (Must be Forbidden 403)
    try:
        with open("test_sample.pdf", "rb") as f:
            files = {"file": ("illegal_doc.pdf", f, "application/pdf")}
            data = {"metadata": json.dumps({"Division": "Division B", "Report Type": "Audit"})}
            res = requests.post(f"{BASE_URL}/documents/upload", files=files, data=data, headers=headers_a)
            if res.status_code == 403:
                log_result("RBAC: User from Division A prohibited from uploading to Division B (403)", True)
            else:
                log_result("RBAC: User from Division A prohibited from uploading to Division B (403)", False, f"Expected 403, got {res.status_code}")
    except Exception as e:
        log_result("RBAC: User from Division A prohibited from uploading to Division B (403)", False, str(e))

    # 3. User B tries to download Division A doc without approval (Must be Forbidden 403)
    if doc_a_id:
        try:
            res = requests.get(f"{BASE_URL}/documents/{doc_a_id}/download", headers=headers_b)
            if res.status_code == 403:
                log_result("RBAC: Division B user prevented from downloading Division A doc (403)", True)
            else:
                log_result("RBAC: Division B user prevented from downloading Division A doc (403)", False, f"Expected 403, got {res.status_code}")
        except Exception as e:
            log_result("RBAC: Division B user prevented from downloading Division A doc (403)", False, str(e))

    return doc_a_id

def test_access_request_workflow(token_a, token_b, doc_a_id):
    if not token_a or not token_b or not doc_a_id:
        log_result("Access Workflow: Skip due to missing dependencies", False, "Missing tokens or doc_id")
        return

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. User B requests access to doc_a
    req_id = None
    try:
        res = requests.post(f"{BASE_URL}/access/request", json={"doc_id": doc_a_id}, headers=headers_b)
        if res.status_code in [200, 201]:
            req_id = res.json().get("request", {}).get("id")
            log_result("POST /api/access/request (User B requests access)", True)
        else:
            log_result("POST /api/access/request (User B requests access)", False, res.text)
    except Exception as e:
        log_result("POST /api/access/request (User B requests access)", False, str(e))

    # 2. User A views incoming inbox
    try:
        res = requests.get(f"{BASE_URL}/access/inbox", headers=headers_a)
        if res.status_code == 200:
            log_result("GET /api/access/inbox (Division A reviews requests)", True)
        else:
            log_result("GET /api/access/inbox (Division A reviews requests)", False, res.text)
    except Exception as e:
        log_result("GET /api/access/inbox (Division A reviews requests)", False, str(e))

    # 3. User A approves the request
    if req_id:
        try:
            res = requests.post(f"{BASE_URL}/access/approve", json={"request_id": req_id}, headers=headers_a)
            if res.status_code == 200:
                log_result("POST /api/access/approve (Division A approves request)", True)
            else:
                log_result("POST /api/access/approve (Division A approves request)", False, res.text)
        except Exception as e:
            log_result("POST /api/access/approve (Division A approves request)", False, str(e))

        # 4. User B now downloads Division A doc successfully
        try:
            res = requests.get(f"{BASE_URL}/documents/{doc_a_id}/download", headers=headers_b)
            if res.status_code == 200 and len(res.content) > 0:
                log_result("GET /api/documents/<doc_id>/download (Download granted after approval)", True)
            else:
                log_result("GET /api/documents/<doc_id>/download (Download granted after approval)", False, f"Status: {res.status_code}")
        except Exception as e:
            log_result("GET /api/documents/<doc_id>/download (Download granted after approval)", False, str(e))

def test_search(token):
    try:
        res = requests.get(f"{BASE_URL}/search?q=Financial", headers={"Authorization": f"Bearer {token}"})
        if res.status_code == 200 and "results" in res.json():
            log_result("GET /api/search?q=Financial", True)
        else:
            log_result("GET /api/search?q=Financial", False, f"Status: {res.status_code}, {res.text}")
    except Exception as e:
        log_result("GET /api/search?q=Financial", False, str(e))

def test_dynamic_metadata():
    try:
        res = requests.get(f"{BASE_URL}/admin/metadata-fields")
        if res.status_code == 200 and "fields" in res.json():
            log_result("GET /api/admin/metadata-fields", True)
        else:
            log_result("GET /api/admin/metadata-fields", False, res.text)
    except Exception as e:
        log_result("GET /api/admin/metadata-fields", False, str(e))

def generate_report():
    with open(REPORT_FILE, "w") as f:
        f.write("=== BACKEND API TEST REPORT ===\n")
        f.write(f"Total Endpoints Tested: {results['total']}\n")
        f.write(f"Passed: {results['passed']}\n")
        f.write(f"Failed: {results['failed']}\n\n")
        
        if results["failed"] > 0:
            f.write("=== FAILURE DETAILS ===\n")
            for error in results["errors"]:
                f.write(f"{error}\n")
        else:
            f.write(" ALL TESTS PASSED SUCCESSFULLY!\n")

if __name__ == "__main__":
    print(f"Running automated API tests against {BASE_URL}...")
    
    # Run test suite
    token_a, token_b = test_authentication()
    test_document_upload(token_a)
    doc_id = test_rbac_isolation(token_a, token_b)
    test_access_request_workflow(token_a, token_b, doc_id)
    test_search(token_a)
    test_dynamic_metadata()
    
    # Output report
    generate_report()
    print(f"\nTesting complete: {results['passed']}/{results['total']} tests passed. Summary written to {REPORT_FILE}.")
