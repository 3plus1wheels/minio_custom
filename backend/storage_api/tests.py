from datetime import datetime, timezone
from io import BytesIO
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
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
    @override_settings(MINIO_PUBLIC_ENDPOINT="https://public.example")
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
        s3.head_object.return_value = {
            "ContentType": "text/plain",
            "Metadata": {},
        }
        s3.generate_presigned_url.return_value = "https://example.test/share"
        s3.get_object_tagging.return_value = {"TagSet": [{"Key": "env", "Value": "test"}]}
        s3.list_object_versions.return_value = {
            "Versions": [
                {
                    "Key": "notes.txt",
                    "VersionId": "1",
                    "IsLatest": True,
                    "LastModified": modified_at,
                    "Size": 5,
                    "ETag": '"abc"',
                }
            ]
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
        self.assertEqual(list_response.data["objects"][0]["content_type"], "text/plain")

        download_response = self.client.get(
            reverse("object-download", kwargs={"bucket": "docs"}),
            {"key": "notes.txt"},
        )
        self.assertEqual(download_response.status_code, 200)
        self.assertEqual(b"".join(download_response.streaming_content), b"hello")

        share_response = self.client.get(reverse("object-share", kwargs={"bucket": "docs"}), {"key": "notes.txt"})
        self.assertEqual(share_response.status_code, 200)
        self.assertEqual(share_response.data["url"], "https://example.test/share")
        get_s3_client.assert_any_call(endpoint_url="https://public.example")

        preview_response = self.client.get(
            reverse("object-share", kwargs={"bucket": "docs"}),
            {"key": "notes.txt", "preview": "true"},
        )
        self.assertEqual(preview_response.status_code, 200)
        s3.generate_presigned_url.assert_any_call(
            "get_object",
            Params={
                "Bucket": "docs",
                "Key": "notes.txt",
                "ResponseContentDisposition": 'inline; filename="notes.txt"',
                "ResponseContentType": "text/plain",
            },
            ExpiresIn=12 * 60 * 60,
        )

        tags_response = self.client.get(reverse("object-tags", kwargs={"bucket": "docs"}), {"key": "notes.txt"})
        self.assertEqual(tags_response.status_code, 200)
        self.assertEqual(tags_response.data["tags"], {"env": "test"})

        save_tags_response = self.client.put(
            f'{reverse("object-tags", kwargs={"bucket": "docs"})}?key=notes.txt',
            {"tags": {"env": "prod"}},
            format="json",
        )
        self.assertEqual(save_tags_response.status_code, 200)
        s3.put_object_tagging.assert_called_once_with(
            Bucket="docs",
            Key="notes.txt",
            Tagging={"TagSet": [{"Key": "env", "Value": "prod"}]},
        )

        versions_response = self.client.get(
            reverse("object-versions", kwargs={"bucket": "docs"}),
            {"key": "notes.txt"},
        )
        self.assertEqual(versions_response.status_code, 200)
        self.assertEqual(versions_response.data["versions"][0]["version_id"], "1")

        delete_response = self.client.delete(
            f'{reverse("object-list-create-delete", kwargs={"bucket": "docs"})}?key=notes.txt'
        )
        self.assertEqual(delete_response.status_code, 204)
        s3.delete_object.assert_called_once_with(Bucket="docs", Key="notes.txt")
