from datetime import datetime, timezone
from io import BytesIO
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from storage_api.models import UserProfile, VisibilityGrant


def set_role(user, role):
    UserProfile.objects.update_or_create(user=user, defaults={"role": role})
    return user


def object_fixture(key, size=5):
    return {
        "Key": key,
        "Size": size,
        "LastModified": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "ETag": '"abc"',
    }


class AuthAndAdminTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = get_user_model().objects.create_superuser(
            username="root",
            password="password123",
        )
        self.admin = set_role(
            get_user_model().objects.create_user(username="manager", password="password123"),
            UserProfile.ROLE_ADMIN,
        )

    def test_register_disabled_and_me_includes_role_permissions(self):
        register_response = self.client.post(
            reverse("register"),
            {"username": "alice", "password": "password123"},
            format="json",
        )
        self.assertEqual(register_response.status_code, 403)

        token_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "root", "password": "password123"},
            format="json",
        )
        self.assertEqual(token_response.status_code, 200)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}")
        me_response = self.client.get(reverse("me"))
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data["role"], "superuser")
        self.assertTrue(me_response.data["permissions"]["can_manage_admins"])

    def test_superuser_can_create_admin_editor_viewer_and_grants(self):
        self.client.force_authenticate(self.superuser)

        for role in (UserProfile.ROLE_ADMIN, UserProfile.ROLE_EDITOR, UserProfile.ROLE_VIEWER):
            response = self.client.post(
                reverse("user-list-create"),
                {"username": f"{role}user", "password": "password123", "role": role},
                format="json",
            )
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.data["role"], role)

        grant_response = self.client.post(
            reverse("visibility-grant-list-create"),
            {
                "target_type": VisibilityGrant.TARGET_ROLE,
                "role": UserProfile.ROLE_VIEWER,
                "bucket": "docs",
                "prefix": "public/",
                "access": VisibilityGrant.ACCESS_READ,
            },
            format="json",
        )
        self.assertEqual(grant_response.status_code, 201)
        self.assertEqual(grant_response.data["prefix"], "public/")

    def test_admin_cannot_manage_admin_or_superuser(self):
        self.client.force_authenticate(self.admin)

        create_admin = self.client.post(
            reverse("user-list-create"),
            {"username": "newadmin", "password": "password123", "role": UserProfile.ROLE_ADMIN},
            format="json",
        )
        self.assertEqual(create_admin.status_code, 403)

        edit_super = self.client.patch(
            reverse("user-detail", kwargs={"user_id": self.superuser.id}),
            {"username": "changed"},
            format="json",
        )
        self.assertEqual(edit_super.status_code, 403)

        create_editor = self.client.post(
            reverse("user-list-create"),
            {"username": "editor", "password": "password123", "role": UserProfile.ROLE_EDITOR},
            format="json",
        )
        self.assertEqual(create_editor.status_code, 201)


class StorageApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = set_role(
            get_user_model().objects.create_user(username="admin", password="password123"),
            UserProfile.ROLE_ADMIN,
        )
        self.editor = set_role(
            get_user_model().objects.create_user(username="editor", password="password123"),
            UserProfile.ROLE_EDITOR,
        )
        self.viewer = set_role(
            get_user_model().objects.create_user(username="viewer", password="password123"),
            UserProfile.ROLE_VIEWER,
        )

    def mock_s3(self, get_s3_client):
        s3 = Mock()
        get_s3_client.return_value = s3
        created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        s3.list_buckets.return_value = {
            "Buckets": [
                {"Name": "docs", "CreationDate": created_at},
                {"Name": "private", "CreationDate": created_at},
            ]
        }
        s3.list_objects_v2.return_value = {
            "Contents": [
                object_fixture("public/readme.txt"),
                object_fixture("private/secret.txt"),
                object_fixture("editor/upload.txt"),
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
                    "Key": "public/readme.txt",
                    "VersionId": "1",
                    "IsLatest": True,
                    "LastModified": datetime(2026, 1, 1, tzinfo=timezone.utc),
                    "Size": 5,
                    "ETag": '"abc"',
                }
            ]
        }
        return s3

    def test_bucket_endpoints_require_auth(self):
        response = APIClient().get(reverse("bucket-list-create"))
        self.assertEqual(response.status_code, 401)

    @patch("storage_api.views.get_s3_client")
    def test_admin_can_list_create_delete_buckets(self, get_s3_client):
        self.client.force_authenticate(self.admin)
        s3 = self.mock_s3(get_s3_client)

        list_response = self.client.get(reverse("bucket-list-create"))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual([item["name"] for item in list_response.data["buckets"]], ["docs", "private"])

        create_response = self.client.post(reverse("bucket-list-create"), {"name": "new-bucket"}, format="json")
        self.assertEqual(create_response.status_code, 201)
        s3.create_bucket.assert_called_once_with(Bucket="new-bucket")

        delete_response = self.client.delete(reverse("bucket-detail", kwargs={"bucket": "new-bucket"}))
        self.assertEqual(delete_response.status_code, 204)
        s3.delete_bucket.assert_called_once_with(Bucket="new-bucket")

    @patch("storage_api.views.get_s3_client")
    def test_viewer_sees_nothing_without_grants(self, get_s3_client):
        self.client.force_authenticate(self.viewer)
        self.mock_s3(get_s3_client)

        bucket_response = self.client.get(reverse("bucket-list-create"))
        self.assertEqual(bucket_response.status_code, 200)
        self.assertEqual(bucket_response.data["buckets"], [])

        objects_response = self.client.get(reverse("object-list-create-delete", kwargs={"bucket": "docs"}))
        self.assertEqual(objects_response.status_code, 403)

    @patch("storage_api.views.get_s3_client")
    @override_settings(MINIO_PUBLIC_ENDPOINT="https://public.example")
    def test_viewer_read_prefix_grant_filters_and_blocks_writes(self, get_s3_client):
        self.client.force_authenticate(self.viewer)
        s3 = self.mock_s3(get_s3_client)
        VisibilityGrant.objects.create(
            target_type=VisibilityGrant.TARGET_ROLE,
            role=UserProfile.ROLE_VIEWER,
            bucket="docs",
            prefix="public/",
            access=VisibilityGrant.ACCESS_READ,
        )

        bucket_response = self.client.get(reverse("bucket-list-create"))
        self.assertEqual([item["name"] for item in bucket_response.data["buckets"]], ["docs"])

        list_response = self.client.get(reverse("object-list-create-delete", kwargs={"bucket": "docs"}))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual([item["key"] for item in list_response.data["objects"]], ["public/readme.txt"])

        download_response = self.client.get(
            reverse("object-download", kwargs={"bucket": "docs"}),
            {"key": "public/readme.txt"},
        )
        self.assertEqual(download_response.status_code, 200)

        share_response = self.client.get(
            reverse("object-share", kwargs={"bucket": "docs"}),
            {"key": "public/readme.txt"},
        )
        self.assertEqual(share_response.status_code, 200)
        get_s3_client.assert_any_call(endpoint_url="https://public.example")

        upload_response = self.client.post(
            reverse("object-list-create-delete", kwargs={"bucket": "docs"}),
            {"file": BytesIO(b"hello"), "key": "public/new.txt"},
            format="multipart",
        )
        self.assertEqual(upload_response.status_code, 403)

        delete_response = self.client.delete(
            f"{reverse('object-list-create-delete', kwargs={'bucket': 'docs'})}?key=public/readme.txt",
        )
        self.assertEqual(delete_response.status_code, 403)
        s3.delete_object.assert_not_called()

    @patch("storage_api.views.get_s3_client")
    def test_editor_write_prefix_and_user_specific_grants(self, get_s3_client):
        self.client.force_authenticate(self.editor)
        s3 = self.mock_s3(get_s3_client)
        VisibilityGrant.objects.create(
            target_type=VisibilityGrant.TARGET_ROLE,
            role=UserProfile.ROLE_EDITOR,
            bucket="docs",
            prefix="editor/",
            access=VisibilityGrant.ACCESS_WRITE,
        )
        VisibilityGrant.objects.create(
            target_type=VisibilityGrant.TARGET_USER,
            user=self.editor,
            bucket="docs",
            prefix="public/",
            access=VisibilityGrant.ACCESS_READ,
        )

        list_response = self.client.get(reverse("object-list-create-delete", kwargs={"bucket": "docs"}))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(
            [item["key"] for item in list_response.data["objects"]],
            ["public/readme.txt", "editor/upload.txt"],
        )

        upload_response = self.client.post(
            reverse("object-list-create-delete", kwargs={"bucket": "docs"}),
            {"file": BytesIO(b"hello"), "key": "editor/new.txt"},
            format="multipart",
        )
        self.assertEqual(upload_response.status_code, 201)

        tag_response = self.client.put(
            f"{reverse('object-tags', kwargs={'bucket': 'docs'})}?key=editor/upload.txt",
            {"tags": {"team": "ops"}},
            format="json",
        )
        self.assertEqual(tag_response.status_code, 200)

        forbidden_upload = self.client.post(
            reverse("object-list-create-delete", kwargs={"bucket": "docs"}),
            {"file": BytesIO(b"hello"), "key": "public/new.txt"},
            format="multipart",
        )
        self.assertEqual(forbidden_upload.status_code, 403)

        delete_response = self.client.delete(
            f"{reverse('object-list-create-delete', kwargs={'bucket': 'docs'})}?key=editor/upload.txt",
        )
        self.assertEqual(delete_response.status_code, 204)
        s3.delete_object.assert_called()
