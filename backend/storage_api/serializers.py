from django.contrib.auth import get_user_model
from rest_framework import serializers

from storage_api.models import UserProfile, VisibilityGrant


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = get_user_model()
        fields = ("id", "username", "email", "password")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        return get_user_model().objects.create_user(password=password, **validated_data)


class UserAdminSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8, allow_blank=True)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES, required=False)

    class Meta:
        model = get_user_model()
        fields = ("id", "username", "password", "role", "is_active", "is_superuser")
        read_only_fields = ("id", "is_superuser")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_superuser:
            data["role"] = "superuser"
        else:
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            data["role"] = profile.role
        return data

    def create(self, validated_data):
        password = validated_data.pop("password", "")
        if not password:
            raise serializers.ValidationError({"password": "Password is required."})
        role = validated_data.pop("role", UserProfile.ROLE_VIEWER)
        user = get_user_model().objects.create_user(password=password, **validated_data)
        UserProfile.objects.update_or_create(user=user, defaults={"role": role})
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", "")
        role = validated_data.pop("role", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        if role and not instance.is_superuser:
            UserProfile.objects.update_or_create(user=instance, defaults={"role": role})
        return instance


class VisibilityGrantSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = VisibilityGrant
        fields = (
            "id",
            "target_type",
            "role",
            "user",
            "username",
            "bucket",
            "prefix",
            "access",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "username", "created_at", "updated_at")

    def validate(self, attrs):
        target_type = attrs.get("target_type", getattr(self.instance, "target_type", None))
        role = attrs.get("role", getattr(self.instance, "role", ""))
        user = attrs.get("user", getattr(self.instance, "user", None))
        prefix = attrs.get("prefix", getattr(self.instance, "prefix", ""))

        if target_type == VisibilityGrant.TARGET_ROLE:
            if not role:
                raise serializers.ValidationError({"role": "Role target requires a role."})
            attrs["user"] = None
        elif target_type == VisibilityGrant.TARGET_USER:
            if not user:
                raise serializers.ValidationError({"user": "User target requires a user."})
            attrs["role"] = ""
        else:
            raise serializers.ValidationError({"target_type": "Invalid target type."})

        if prefix:
            attrs["prefix"] = str(prefix).strip().lstrip("/")
        return attrs


class BucketSerializer(serializers.Serializer):
    name = serializers.RegexField(
        regex=r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$",
        max_length=63,
        min_length=3,
    )


class ObjectUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    key = serializers.CharField(required=False, allow_blank=True, max_length=1024)
