from botocore.exceptions import BotoCoreError, ClientError
from django.http import FileResponse
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from storage_api.minio_client import get_s3_client
from storage_api.serializers import BucketSerializer, ObjectUploadSerializer, RegisterSerializer


def error_response(exc, status_code=status.HTTP_400_BAD_REQUEST):
    if isinstance(exc, ClientError):
        detail = exc.response.get("Error", {}).get("Message", str(exc))
    else:
        detail = str(exc)
    return Response({"detail": detail}, status=status_code)


class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer


class MeView(APIView):
    def get(self, request):
        user = request.user
        return Response(
            {
                "id": user.id,
                "username": user.get_username(),
                "email": user.email,
            }
        )


class BucketListCreateView(APIView):
    def get(self, request):
        try:
            response = get_s3_client().list_buckets()
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        buckets = [
            {
                "name": bucket["Name"],
                "created_at": bucket["CreationDate"],
            }
            for bucket in response.get("Buckets", [])
        ]
        return Response({"buckets": buckets})

    def post(self, request):
        serializer = BucketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bucket_name = serializer.validated_data["name"]

        try:
            get_s3_client().create_bucket(Bucket=bucket_name)
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        return Response({"name": bucket_name}, status=status.HTTP_201_CREATED)


class BucketDetailView(APIView):
    def delete(self, request, bucket):
        try:
            get_s3_client().delete_bucket(Bucket=bucket)
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ObjectView(APIView):
    def get(self, request, bucket, download=False):
        key = request.query_params.get("key")
        if download:
            if not key:
                return Response({"detail": "Query parameter 'key' is required."}, status=400)
            try:
                s3_object = get_s3_client().get_object(Bucket=bucket, Key=key)
            except (ClientError, BotoCoreError) as exc:
                return error_response(exc, status.HTTP_404_NOT_FOUND)

            return FileResponse(
                s3_object["Body"],
                as_attachment=True,
                filename=key.split("/")[-1] or "download",
                content_type=s3_object.get("ContentType", "application/octet-stream"),
            )

        try:
            response = get_s3_client().list_objects_v2(Bucket=bucket)
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        s3_client = get_s3_client()
        objects = []
        for item in response.get("Contents", []):
            key = item["Key"]
            object_data = {
                "key": key,
                "size": item["Size"],
                "last_modified": item["LastModified"],
                "etag": item["ETag"],
                "content_type": "binary/octet-stream",
                "metadata": {},
            }
            try:
                head = s3_client.head_object(Bucket=bucket, Key=key)
            except (ClientError, BotoCoreError):
                head = {}
            object_data["content_type"] = head.get("ContentType") or object_data["content_type"]
            object_data["metadata"] = head.get("Metadata") or {}
            objects.append(object_data)
        return Response({"objects": objects})

    def post(self, request, bucket):
        serializer = ObjectUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_file = serializer.validated_data["file"]
        key = serializer.validated_data.get("key") or uploaded_file.name

        extra_args = {}
        if uploaded_file.content_type:
            extra_args["ContentType"] = uploaded_file.content_type

        try:
            if extra_args:
                get_s3_client().upload_fileobj(uploaded_file, bucket, key, ExtraArgs=extra_args)
            else:
                get_s3_client().upload_fileobj(uploaded_file, bucket, key)
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        return Response({"bucket": bucket, "key": key}, status=status.HTTP_201_CREATED)

    def delete(self, request, bucket):
        key = request.query_params.get("key")
        if not key:
            return Response({"detail": "Query parameter 'key' is required."}, status=400)

        try:
            get_s3_client().delete_object(Bucket=bucket, Key=key)
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ObjectShareView(APIView):
    def get(self, request, bucket):
        key = request.query_params.get("key")
        if not key:
            return Response({"detail": "Query parameter 'key' is required."}, status=400)

        try:
            url = get_s3_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=3600,
            )
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        return Response({"url": url, "expires_in": 3600})


class ObjectTagsView(APIView):
    def get(self, request, bucket):
        key = request.query_params.get("key")
        if not key:
            return Response({"detail": "Query parameter 'key' is required."}, status=400)

        try:
            response = get_s3_client().get_object_tagging(Bucket=bucket, Key=key)
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        tags = {item["Key"]: item["Value"] for item in response.get("TagSet", [])}
        return Response({"tags": tags})

    def put(self, request, bucket):
        key = request.query_params.get("key")
        if not key:
            return Response({"detail": "Query parameter 'key' is required."}, status=400)

        tags = request.data.get("tags", {})
        if not isinstance(tags, dict):
            return Response({"detail": "'tags' must be an object."}, status=400)

        tag_set = [{"Key": str(name), "Value": str(value)} for name, value in tags.items()]
        try:
            get_s3_client().put_object_tagging(
                Bucket=bucket,
                Key=key,
                Tagging={"TagSet": tag_set},
            )
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        return Response({"tags": tags})


class ObjectVersionsView(APIView):
    def get(self, request, bucket):
        key = request.query_params.get("key")
        if not key:
            return Response({"detail": "Query parameter 'key' is required."}, status=400)

        try:
            response = get_s3_client().list_object_versions(Bucket=bucket, Prefix=key)
        except (ClientError, BotoCoreError) as exc:
            return error_response(exc)

        versions = [
            {
                "version_id": item.get("VersionId"),
                "is_latest": item.get("IsLatest", False),
                "last_modified": item.get("LastModified"),
                "size": item.get("Size", 0),
                "etag": item.get("ETag"),
            }
            for item in response.get("Versions", [])
            if item.get("Key") == key
        ]
        return Response({"versions": versions})
