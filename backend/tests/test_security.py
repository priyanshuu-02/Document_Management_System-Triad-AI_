"""Focused checks for server-side access enforcement (in-memory database).

    cd backend && python -m unittest discover -s tests -v
"""
import io
import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "unit-test-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mongomock
from bson import ObjectId

from app import create_app
from app.seed import seed_metadata_fields, DEFAULT_METADATA_FIELDS
from app.db import db_manager, InMemoryGridFS
from app.models.user import UserModel
from app.middleware.auth_middleware import generate_token


class AccessSecurityTests(unittest.TestCase):
    def setUp(self):
        db_manager.client = mongomock.MongoClient()
        db_manager.db = db_manager.client["triad_security_test"]
        db_manager.fs = InMemoryGridFS()
        db_manager.is_mock = True
        self.app = create_app()
        self.client = self.app.test_client()
        self.db = db_manager.db

        self.admin = UserModel.create_user_doc("admin", "admin@test.local", "Password123!", "Division A", "admin")
        self.alice = UserModel.create_user_doc("alice", "alice@test.local", "Password123!", "Division A")
        self.bob = UserModel.create_user_doc("bob", "bob@test.local", "Password123!", "Division B")
        for user in (self.admin, self.alice, self.bob):
            user["_id"] = self.db.users.insert_one(user).inserted_id

    def headers(self, user):
        return {"Authorization": "Bearer " + generate_token(str(user["_id"]), user["username"], user["division"], user["role"])}

    def upload_as_alice(self):
        response = self.client.post(
            "/api/documents/upload",
            headers=self.headers(self.alice),
            data={"file": (io.BytesIO(b"%PDF-1.4\nconfidential needle\n%%EOF"), "report.pdf"), "metadata": '{"Division":"Division A"}'},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 201)
        return response.get_json()["document"]["id"]

    def test_authentication_and_revocation_are_enforced(self):
        doc_id = self.upload_as_alice()
        self.db.documents.update_one({"_id": ObjectId(doc_id)}, {"$set": {"ocr_text": "confidential needle"}})
        self.assertEqual(self.client.get(f"/api/documents/{doc_id}/download").status_code, 401)
        self.assertEqual(self.client.get("/api/search?q=needle").status_code, 401)
        self.assertEqual(self.client.post("/api/access/approve", json={"request_id": "x"}).status_code, 401)

        request_response = self.client.post("/api/access/request", headers=self.headers(self.bob), json={"doc_id": doc_id})
        self.assertEqual(request_response.status_code, 201)
        request_id = request_response.get_json()["request"]["id"]
        self.assertEqual(self.client.post("/api/access/approve", headers=self.headers(self.alice), json={"request_id": request_id, "note": "Need-to-know confirmed"}).status_code, 200)
        self.assertEqual(self.client.get(f"/api/documents/{doc_id}/download", headers=self.headers(self.bob)).status_code, 200)
        approved_search = self.client.get("/api/search?q=needle", headers=self.headers(self.bob)).get_json()["results"]
        self.assertEqual(len(approved_search), 1)
        self.assertIn("ocr_text", approved_search[0]["matched_fields"])

        self.assertEqual(self.client.post("/api/access/revoke", headers=self.headers(self.alice), json={"request_id": request_id}).status_code, 403)
        self.assertEqual(self.client.post("/api/access/revoke", headers=self.headers(self.admin), json={"request_id": request_id, "note": "Project complete"}).status_code, 200)
        self.assertEqual(self.client.get(f"/api/documents/{doc_id}/download", headers=self.headers(self.bob)).status_code, 403)
        detail = self.client.get(f"/api/documents/{doc_id}", headers=self.headers(self.bob)).get_json()["document"]
        self.assertFalse(detail["can_download"])
        self.assertEqual(detail["ocr_text"], "")
        self.assertTrue(detail["ocr_restricted"])
        revoked_search = self.client.get("/api/search?q=needle", headers=self.headers(self.bob)).get_json()["results"]
        self.assertEqual(revoked_search, [])

        events = self.client.get("/api/admin/audit-events", headers=self.headers(self.admin)).get_json()["events"]
        self.assertEqual({event["event_type"] for event in events}, {"access_requested", "access_approved", "access_revoked"})
        self.assertEqual(self.client.get("/api/admin/audit-events", headers=self.headers(self.bob)).status_code, 403)

    def test_public_registration_cannot_create_an_admin(self):
        response = self.client.post("/api/auth/register", json={"username": "attacker", "email": "attacker@test.local", "password": "Password123!", "division": "Division B", "role": "admin"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["user"]["role"], "user")

    def test_admin_user_management_and_role_promotion(self):
        # 1. Non-admin cannot list users
        self.assertEqual(self.client.get("/api/admin/users", headers=self.headers(self.bob)).status_code, 403)

        # 2. Admin lists users successfully
        list_res = self.client.get("/api/admin/users", headers=self.headers(self.admin))
        self.assertEqual(list_res.status_code, 200)
        users = list_res.get_json()["users"]
        self.assertGreaterEqual(len(users), 3)

        # 3. Non-admin cannot promote anyone
        bob_promote_res = self.client.post(f"/api/admin/users/{self.bob['_id']}/role", headers=self.headers(self.bob), json={"role": "admin"})
        self.assertEqual(bob_promote_res.status_code, 403)

        # 4. Admin promotes Bob to admin
        admin_promote_res = self.client.post(
            f"/api/admin/users/{self.bob['_id']}/role",
            headers=self.headers(self.admin),
            json={"role": "admin", "note": "Promoted to division admin"}
        )
        self.assertEqual(admin_promote_res.status_code, 200)
        self.assertEqual(admin_promote_res.get_json()["user"]["role"], "admin")

        # 5. Bob logs in again or uses updated role token and now has admin rights
        bob_updated = self.db.users.find_one({"_id": self.bob["_id"]})
        self.assertEqual(bob_updated["role"], "admin")
        self.assertEqual(self.client.get("/api/admin/verify", headers=self.headers(bob_updated)).status_code, 200)
        self.assertEqual(self.client.get("/api/admin/users", headers=self.headers(bob_updated)).status_code, 200)

        # 6. Admin cannot demote their own account (prevents accidental lockout)
        self_demote = self.client.post(f"/api/admin/users/{self.admin['_id']}/role", headers=self.headers(self.admin), json={"role": "user"})
        self.assertEqual(self_demote.status_code, 400)

        # 7. Audit log contains user_role_updated event
        events = self.client.get("/api/admin/audit-events", headers=self.headers(self.admin)).get_json()["events"]
        role_events = [e for e in events if e.get("event_type") == "user_role_updated"]
        self.assertEqual(len(role_events), 1)
        self.assertEqual(role_events[0]["subject_username"], "bob")
        self.assertEqual(role_events[0]["new_role"], "admin")

    def test_rerequest_after_rejection_can_be_approved(self):
        """An old rejected request must not mask a later approval."""
        doc_id = self.upload_as_alice()
        bob, alice = self.headers(self.bob), self.headers(self.alice)

        first = self.client.post("/api/access/request", headers=bob, json={"doc_id": doc_id}).get_json()["request"]["id"]
        self.assertEqual(self.client.post("/api/access/reject", headers=alice, json={"request_id": first}).status_code, 200)
        self.assertEqual(self.client.get(f"/api/documents/{doc_id}/download", headers=bob).status_code, 403)

        second_res = self.client.post("/api/access/request", headers=bob, json={"doc_id": doc_id})
        self.assertEqual(second_res.status_code, 201)
        second = second_res.get_json()["request"]["id"]
        self.assertNotEqual(first, second)
        # A duplicate request while one is pending returns the pending one
        dup = self.client.post("/api/access/request", headers=bob, json={"doc_id": doc_id}).get_json()["request"]["id"]
        self.assertEqual(dup, second)

        self.assertEqual(self.client.post("/api/access/approve", headers=alice, json={"request_id": second}).status_code, 200)
        self.assertEqual(self.client.get(f"/api/documents/{doc_id}/download", headers=bob).status_code, 200)
        detail = self.client.get(f"/api/documents/{doc_id}", headers=bob).get_json()["document"]
        self.assertTrue(detail["can_download"])

    def test_other_division_cannot_approve(self):
        doc_id = self.upload_as_alice()
        carol = UserModel.create_user_doc("carol", "carol@test.local", "Password123!", "Division C")
        carol["_id"] = self.db.users.insert_one(carol).inserted_id
        req_id = self.client.post("/api/access/request", headers=self.headers(self.bob), json={"doc_id": doc_id}).get_json()["request"]["id"]
        self.assertEqual(self.client.post("/api/access/approve", headers=self.headers(carol), json={"request_id": req_id}).status_code, 403)
        self.assertEqual(self.client.post("/api/access/approve", headers=self.headers(self.bob), json={"request_id": req_id}).status_code, 403)

    def test_search_metadata_is_discoverable_but_ocr_is_not(self):
        response = self.client.post(
            "/api/documents/upload",
            headers=self.headers(self.alice),
            data={"file": (io.BytesIO(b"%PDF-1.4\n%%EOF"), "q3.pdf"),
                  "metadata": '{"Division":"Division A","Report Type":"Financial"}'},
            content_type="multipart/form-data",
        )
        doc_id = response.get_json()["document"]["id"]
        self.db.documents.update_one({"_id": ObjectId(doc_id)}, {"$set": {"ocr_text": "secret merger plan"}})

        # Bob (Division B) can discover the document by metadata, without OCR content
        results = self.client.get("/api/search?q=financial", headers=self.headers(self.bob)).get_json()["results"]
        self.assertEqual([r["id"] for r in results], [doc_id])
        self.assertIn("metadata:Report Type", results[0]["matched_fields"])
        self.assertEqual(results[0]["ocr_text"], "")
        self.assertFalse(results[0]["can_download"])

        # ...but cannot find it by its confidential content
        self.assertEqual(self.client.get("/api/search?q=merger", headers=self.headers(self.bob)).get_json()["results"], [])
        own = self.client.get("/api/search?q=merger", headers=self.headers(self.alice)).get_json()["results"]
        self.assertEqual(len(own), 1)
        self.assertIn("merger", own[0]["snippet"])

        # Regex metacharacters in a query are treated literally
        self.assertEqual(self.client.get("/api/search?q=.*", headers=self.headers(self.alice)).status_code, 200)
        self.assertEqual(self.client.get("/api/search?q=.*", headers=self.headers(self.alice)).get_json()["results"], [])

    def test_document_list_filters_by_dynamic_metadata(self):
        for name, report_type in (("a.pdf", "Financial"), ("b.pdf", "Audit")):
            self.client.post(
                "/api/documents/upload",
                headers=self.headers(self.alice),
                data={"file": (io.BytesIO(b"%PDF-1.4\n%%EOF"), name),
                      "metadata": '{"Division":"Division A","Report Type":"%s"}' % report_type},
                content_type="multipart/form-data",
            )
        docs = self.client.get("/api/documents", query_string={"Report Type": "Financial"},
                               headers=self.headers(self.alice)).get_json()["documents"]
        self.assertEqual([d["filename"] for d in docs], ["a.pdf"])
        # Division isolation: Bob sees none of Division A's documents
        self.assertEqual(self.client.get("/api/documents", headers=self.headers(self.bob)).get_json()["documents"], [])

    def test_metadata_field_names_are_matched_literally(self):
        admin = self.headers(self.admin)
        self.assertEqual(self.client.post("/api/admin/metadata-fields", headers=admin, json={"name": "Region"}).status_code, 201)
        # "R.*" must not be treated as a regex matching "Region"
        self.assertEqual(self.client.post("/api/admin/metadata-fields", headers=admin, json={"name": "R.*"}).status_code, 201)
        self.assertEqual(self.client.post("/api/admin/metadata-fields", headers=admin, json={"name": "region"}).status_code, 409)

    def test_seeding_never_recreates_deleted_fields(self):
        self.assertEqual(seed_metadata_fields(self.db), len(DEFAULT_METADATA_FIELDS))
        self.assertEqual(seed_metadata_fields(self.db), 0)
        self.db.metadata_fields.delete_one({"name": "Fiscal Year"})
        self.assertEqual(seed_metadata_fields(self.db), 0)
        self.assertIsNone(self.db.metadata_fields.find_one({"name": "Fiscal Year"}))


if __name__ == "__main__":
    unittest.main()
