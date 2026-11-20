"""Unmodified-style assignment smoke test; the upstream evaluator sends one anonymous upload."""
import json
import os
import requests

BASE_URL = "http://localhost:5000/api"
REPORT_FILE = "test_report.txt"
results = {"total": 0, "passed": 0, "failed": 0, "errors": []}

def log_result(test_name, success, error_msg=""):
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
        results["errors"].append(f"[{test_name}] FAILED: {error_msg}")

def test_document_upload():
    if not os.path.exists("test_sample.pdf"):
        with open("test_sample.pdf", "wb") as f:
            f.write(b"%PDF-1.4\n%" + b"A" * 1024 + b"\n%%EOF")
    try:
        with open("test_sample.pdf", "rb") as f:
            response = requests.post(
                f"{BASE_URL}/documents/upload",
                files={"file": ("test_sample.pdf", f, "application/pdf")},
                data={"metadata": json.dumps({"Division": "Division A", "Report Type": "Financial"})},
            )
        log_result("POST /api/documents/upload", response.status_code in [200, 201],
                   f"Expected 200/201, got {response.status_code}. Response: {response.text}")
    except requests.exceptions.ConnectionError:
        log_result("POST /api/documents/upload", False, "Connection Refused. Is the Flask server running on port 5000?")
    except Exception as exc:
        log_result("POST /api/documents/upload", False, str(exc))

def generate_report():
    with open(REPORT_FILE, "w") as f:
        f.write("=== BACKEND API TEST REPORT ===\n")
        f.write(f"Total Endpoints Tested: {results['total']}\nPassed: {results['passed']}\nFailed: {results['failed']}\n\n")
        if results["failed"]:
            f.write("=== FAILURE DETAILS ===\n" + "\n".join(results["errors"]) + "\n")

if __name__ == "__main__":
    test_document_upload()
    generate_report()
