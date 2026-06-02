from datetime import datetime, timezone
from io import BytesIO
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient


class AuthTests(TestCase):
    def test_register_login_and_me(self):
        client = APIClient()
        register_response = client.post(
            reverse("register"),
            {"username": "alice", "email": "alice@example.com", "password": "password123"},
            format="json",
        )
        self.assertEqual(register_response.status_code, 201)

        token_response = client.post(
            reverse("token_obtain_pair"),
            {"username": "alice", "password": "password123"},
            format="json",
        )
        self.assertEqual(token_response.status_code, 200)
        access = token_response.data["access"]

        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        me_response = client.get(reverse("me"))
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data["username"], "alice")


class StorageApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="bob", password="password123")
        self.client.force_authenticate(self.user)

    def test_bucket_endpoints_require_auth(self):
        client = APIClient()
        response = client.get(reverse("bucket-list-create"))
        self.assertEqual(response.status_code, 401)

    @patch("storage_api.views.get_s3_client")
    def test_list_create_delete_buckets(self, get_s3_client):
        s3 = Mock()
        get_s3_client.return_value = s3
        created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        s3.list_buckets.return_value = {"Buckets": [{"Name": "photos", "CreationDate": created_at}]}

        list_response = self.client.get(reverse("bucket-list-create"))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data["buckets"][0]["name"], "photos")

        create_response = self.client.post(reverse("bucket-list-create"), {"name": "new-bucket"}, format="json")
        self.assertEqual(create_response.status_code, 201)
        s3.create_bucket.assert_called_once_with(Bucket="new-bucket")

        delete_response = self.client.delete(reverse("bucket-detail", kwargs={"bucket": "new-bucket"}))
        self.assertEqual(delete_response.status_code, 204)
        s3.delete_bucket.assert_called_once_with(Bucket="new-bucket")

    @patch("storage_api.views.get_s3_client")
    def test_object_upload_list_download_delete(self, get_s3_client):
        s3 = Mock()
        get_s3_client.return_value = s3
        modified_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        s3.list_objects_v2.return_value = {
            "Contents": [
                {
                    "Key": "notes.txt",
                    "Size": 5,
                    "LastModified": modified_at,
                    "ETag": '"abc"',
                }
            ]
        }
        s3.get_object.return_value = {
            "Body": BytesIO(b"hello"),
            "ContentType": "text/plain",
        }

        upload_response = self.client.post(
            reverse("object-list-create-delete", kwargs={"bucket": "docs"}),
            {"file": BytesIO(b"hello")},
            format="multipart",
        )
        self.assertEqual(upload_response.status_code, 201)
        self.assertEqual(upload_response.data["key"], "file")

        list_response = self.client.get(reverse("object-list-create-delete", kwargs={"bucket": "docs"}))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data["objects"][0]["key"], "notes.txt")

        download_response = self.client.get(
            reverse("object-download", kwargs={"bucket": "docs"}),
            {"key": "notes.txt"},
        )
        self.assertEqual(download_response.status_code, 200)
        self.assertEqual(b"".join(download_response.streaming_content), b"hello")

        delete_response = self.client.delete(
            f'{reverse("object-list-create-delete", kwargs={"bucket": "docs"})}?key=notes.txt'
        )
        self.assertEqual(delete_response.status_code, 204)
        s3.delete_object.assert_called_once_with(Bucket="docs", Key="notes.txt")
