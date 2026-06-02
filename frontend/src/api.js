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
    throw new Error(error.detail || "Request failed");
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
