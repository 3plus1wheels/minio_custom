from django.contrib.auth import get_user_model
from rest_framework import serializers


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = get_user_model()
        fields = ("id", "username", "email", "password")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        return get_user_model().objects.create_user(password=password, **validated_data)


class BucketSerializer(serializers.Serializer):
    name = serializers.RegexField(
        regex=r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$",
        max_length=63,
        min_length=3,
    )


class ObjectUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    key = serializers.CharField(required=False, allow_blank=True, max_length=1024)
