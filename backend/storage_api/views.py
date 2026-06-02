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

        objects = [
            {
                "key": item["Key"],
                "size": item["Size"],
                "last_modified": item["LastModified"],
                "etag": item["ETag"],
            }
            for item in response.get("Contents", [])
        ]
        return Response({"objects": objects})

    def post(self, request, bucket):
        serializer = ObjectUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_file = serializer.validated_data["file"]
        key = serializer.validated_data.get("key") or uploaded_file.name

        try:
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
