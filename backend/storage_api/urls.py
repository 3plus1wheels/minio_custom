from django.urls import path

from storage_api.views import BucketDetailView, BucketListCreateView, MeView, ObjectView


urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
    path("buckets/", BucketListCreateView.as_view(), name="bucket-list-create"),
    path("buckets/<str:bucket>/", BucketDetailView.as_view(), name="bucket-detail"),
    path("buckets/<str:bucket>/objects/", ObjectView.as_view(), name="object-list-create-delete"),
    path(
        "buckets/<str:bucket>/objects/download/",
        ObjectView.as_view(),
        {"download": True},
        name="object-download",
    ),
]
