from django.conf import settings
from django.db import models
from django.db.models import Q


class UserProfile(models.Model):
    ROLE_ADMIN = "admin"
    ROLE_EDITOR = "editor"
    ROLE_VIEWER = "viewer"
    ROLE_CHOICES = (
        (ROLE_ADMIN, "Admin"),
        (ROLE_EDITOR, "Editor"),
        (ROLE_VIEWER, "Viewer"),
    )

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default=ROLE_VIEWER)

    def __str__(self):
        return f"{self.user} ({self.role})"


class VisibilityGrant(models.Model):
    TARGET_ROLE = "role"
    TARGET_USER = "user"
    TARGET_CHOICES = (
        (TARGET_ROLE, "Role"),
        (TARGET_USER, "User"),
    )

    ACCESS_READ = "read"
    ACCESS_WRITE = "write"
    ACCESS_CHOICES = (
        (ACCESS_READ, "Read"),
        (ACCESS_WRITE, "Write"),
    )

    target_type = models.CharField(max_length=8, choices=TARGET_CHOICES)
    role = models.CharField(max_length=16, choices=UserProfile.ROLE_CHOICES, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="visibility_grants",
    )
    bucket = models.CharField(max_length=63)
    prefix = models.CharField(max_length=1024, blank=True, default="")
    access = models.CharField(max_length=8, choices=ACCESS_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["bucket", "prefix", "target_type", "role", "user_id"]
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(target_type="role", role__in=["admin", "editor", "viewer"], user__isnull=True)
                    | Q(target_type="user", role="", user__isnull=False)
                ),
                name="visibility_grant_valid_target",
            ),
            models.UniqueConstraint(
                fields=["target_type", "role", "bucket", "prefix", "access"],
                condition=Q(target_type="role"),
                name="unique_role_visibility_grant",
            ),
            models.UniqueConstraint(
                fields=["target_type", "user", "bucket", "prefix", "access"],
                condition=Q(target_type="user"),
                name="unique_user_visibility_grant",
            ),
        ]

    def __str__(self):
        target = self.role if self.target_type == self.TARGET_ROLE else self.user_id
        return f"{self.target_type}:{target} {self.access} {self.bucket}/{self.prefix}"
