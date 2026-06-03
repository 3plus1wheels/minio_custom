const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    const apiError = new Error(error.detail || "Request failed");
    apiError.status = response.status;
    throw apiError;
  }

  if (response.status === 204) return null;
  return response.json();
}

export function login(username, password) {
  return apiRequest("/auth/token/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function register(username, password) {
  return apiRequest("/auth/register/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function createBucket(token, name) {
  return apiRequest("/buckets/", {
    token,
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function listBuckets(token) {
  return apiRequest("/buckets/", { token });
}

export function listObjects(token, bucket) {
  return apiRequest(`/buckets/${encodeURIComponent(bucket)}/objects/`, { token });
}

export function uploadObject(token, bucket, file, key) {
  const formData = new FormData();
  formData.append("file", file);
  if (key) formData.append("key", key);

  return apiRequest(`/buckets/${encodeURIComponent(bucket)}/objects/`, {
    token,
    method: "POST",
    body: formData,
  });
}

export async function downloadObject(token, bucket, key) {
  const response = await fetch(
    `${API_BASE_URL}/buckets/${encodeURIComponent(bucket)}/objects/download/?key=${encodeURIComponent(key)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    const apiError = new Error(error.detail || "Request failed");
    apiError.status = response.status;
    throw apiError;
  }

  return response.blob();
}

export function shareObject(token, bucket, key) {
  return apiRequest(
    `/buckets/${encodeURIComponent(bucket)}/objects/share/?key=${encodeURIComponent(key)}`,
    { token }
  );
}

export function getObjectTags(token, bucket, key) {
  return apiRequest(
    `/buckets/${encodeURIComponent(bucket)}/objects/tags/?key=${encodeURIComponent(key)}`,
    { token }
  );
}

export function saveObjectTags(token, bucket, key, tags) {
  return apiRequest(
    `/buckets/${encodeURIComponent(bucket)}/objects/tags/?key=${encodeURIComponent(key)}`,
    {
      token,
      method: "PUT",
      body: JSON.stringify({ tags }),
    }
  );
}

export function listObjectVersions(token, bucket, key) {
  return apiRequest(
    `/buckets/${encodeURIComponent(bucket)}/objects/versions/?key=${encodeURIComponent(key)}`,
    { token }
  );
}

export function deleteObject(token, bucket, key) {
  return apiRequest(
    `/buckets/${encodeURIComponent(bucket)}/objects/?key=${encodeURIComponent(key)}`,
    {
      token,
      method: "DELETE",
    }
  );
}
