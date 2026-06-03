import {
  ArrowLeft,
  BookOpenText,
  CircleHelp,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Folder,
  LogOut,
  Moon,
  Share2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBasket,
  Tag,
  Trash2,
  Upload,
  Eye,
  EyeOff,
  FolderPlus,
  History,
  Link,
  LockKeyhole,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { defaultStyles, FileIcon } from "react-file-icon";
import {
  createBucket,
  deleteObject,
  downloadObject,
  getObjectTags,
  listBuckets,
  listObjects,
  listObjectVersions,
  login,
  register,
  saveObjectTags,
  shareObject,
  uploadObject,
} from "./api";
import "./styles.css";

function getRoute() {
  const path = window.location.pathname;
  if (path.startsWith("/browser/")) {
    return {
      page: "browser",
      bucket: decodeURIComponent(path.slice("/browser/".length)),
    };
  }
  if (path === "/browser") return { page: "browser", bucket: "" };
  return { page: "login", bucket: "" };
}

function pushRoute(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const SCALE_OPTIONS = [
  { label: "75%", value: "0.75" },
  { label: "90%", value: "0.9" },
  { label: "100%", value: "1" },
  { label: "110%", value: "1.1" },
];

function getInitialScale() {
  const savedScale = localStorage.getItem("appScale");
  return SCALE_OPTIONS.some((option) => option.value === savedScale) ? savedScale : "1";
}

function ScaleControl({ scale, onScaleChange }) {
  return (
    <label className="scale-control" title="Interface scale">
      <Settings size={16} aria-hidden="true" />
      <select
        aria-label="Interface scale"
        value={scale}
        onChange={(event) => onScaleChange(event.target.value)}
      >
        {SCALE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildObjectEntries(objects, prefix, filter, pendingFolders = []) {
  const normalizedPrefix = prefix || "";
  const normalizedFilter = filter.trim().toLowerCase();
  const folders = new Map();
  const files = [];

  function addFolder(folderKey, lastModified) {
    if (!folderKey.startsWith(normalizedPrefix)) return;

    const remainder = folderKey.slice(normalizedPrefix.length);
    if (!remainder) return;

    const slashIndex = remainder.indexOf("/");
    if (slashIndex < 0) return;

    const name = remainder.slice(0, slashIndex);
    if (!name) return;

    const visibleFolderKey = `${normalizedPrefix}${name}/`;
    const existing = folders.get(visibleFolderKey);
    const itemModified = lastModified ? new Date(lastModified).getTime() : 0;
    const existingModified = existing?.last_modified ? new Date(existing.last_modified).getTime() : 0;

    folders.set(visibleFolderKey, {
      type: "folder",
      key: visibleFolderKey,
      name,
      size: null,
      last_modified: itemModified > existingModified ? lastModified : existing?.last_modified,
    });
  }

  for (const folderKey of pendingFolders) {
    addFolder(folderKey);
  }

  for (const item of objects) {
    if (!item.key.startsWith(normalizedPrefix)) continue;

    const remainder = item.key.slice(normalizedPrefix.length);
    if (!remainder) continue;

    const slashIndex = remainder.indexOf("/");
    if (slashIndex >= 0) {
      addFolder(`${normalizedPrefix}${remainder.slice(0, slashIndex + 1)}`, item.last_modified);
      continue;
    }

    files.push({
      ...item,
      type: "file",
      name: remainder,
    });
  }

  return [...folders.values(), ...files]
    .filter((entry) => entry.name.toLowerCase().includes(normalizedFilter))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
}

function getParentPrefix(prefix) {
  const parts = prefix.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `${parts.join("/")}/` : "";
}

function normalizeFolderPath(value) {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function getObjectDisplayName(key = "", prefix = "") {
  const visibleName = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
  return visibleName.split("/").filter(Boolean).pop() || key || "Unnamed object";
}

function getFileExtension(name) {
  const basename = String(name || "").split("/").pop() || "";
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === basename.length - 1) return "";
  return basename.slice(dotIndex + 1).toLowerCase();
}

function getObjectPath(bucketName, key) {
  const pathParts = String(key || "").split("/").filter(Boolean);
  return [bucketName, ...pathParts].filter(Boolean).join(" / ");
}

function getContentType(item) {
  return item.content_type || item.contentType || "binary/octet-stream";
}

function getMetadataEntries(item) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  return Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function getTagEntries(item) {
  const tags = item.tags && typeof item.tags === "object" ? item.tags : {};
  return Object.entries(tags).filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function parseTagLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((tags, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) return tags;
      const name = line.slice(0, separatorIndex).trim();
      const tagValue = line.slice(separatorIndex + 1).trim();
      if (name) tags[name] = tagValue;
      return tags;
    }, {});
}

function formatTagLines(tags) {
  return Object.entries(tags || {})
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");
}

function getShareExpirySeconds(days, hours, minutes) {
  return Math.max(60, Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60);
}

function formatShareExpiryTime(expiresAt) {
  if (!expiresAt) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(expiresAt));
}

function FileTypeIcon({ name }) {
  const extension = getFileExtension(name);
  const style = defaultStyles[extension] || {};

  return (
    <span className="file-type-icon" aria-hidden="true">
      <FileIcon extension={extension} {...style} />
    </span>
  );
}

function WaveCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    let frame = 0;
    let animationId;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      context.clearRect(0, 0, width, height);

      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "rgba(105, 185, 255, 0.08)");
      gradient.addColorStop(0.5, "rgba(196, 235, 255, 0.9)");
      gradient.addColorStop(1, "rgba(81, 173, 232, 0.2)");

      context.lineWidth = 1;
      context.shadowBlur = 12;
      context.shadowColor = "rgba(102, 193, 255, 0.45)";

      for (let line = 0; line < 34; line += 1) {
        const offset = line - 17;
        context.beginPath();
        context.strokeStyle = gradient;

        for (let x = -20; x <= width + 20; x += 10) {
          const progress = x / width;
          const wave =
            Math.sin(progress * 9 + frame * 0.018 + offset * 0.08) * 66 +
            Math.sin(progress * 17 - frame * 0.011 + offset * 0.12) * 24;
          const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
          const y = height * 0.6 + wave * taper + offset * 5.8;
          if (x === -20) context.moveTo(x, y);
          else context.lineTo(x, y);
        }

        context.stroke();
      }

      context.shadowBlur = 0;
      context.fillStyle = "rgba(198, 232, 255, 0.75)";
      for (let i = 0; i < 48; i += 1) {
        const x = ((i * 89 + frame * (0.18 + (i % 5) * 0.03)) % (width + 160)) - 80;
        const y = height * 0.6 + Math.sin(i * 1.7 + frame * 0.02) * 150;
        const alpha = 0.2 + ((i % 7) / 10);
        context.globalAlpha = alpha;
        context.beginPath();
        context.arc(x, y, 1.25, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;

      frame += 1;
      animationId = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="wave-canvas" ref={canvasRef} aria-hidden="true" />;
}

function App() {
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem("accessToken") || "");
  const [appScale, setAppScale] = useState(getInitialScale);
  const [route, setRoute] = useState(getRoute);
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  const canSubmit = username.trim() && password.length >= 8 && !isSubmitting;

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  useEffect(() => {
    if (!accessToken && route.page !== "login") pushRoute("/login");
    if (accessToken && route.page === "login") pushRoute("/browser");
  }, [accessToken, route.page]);

  useEffect(() => {
    document.documentElement.style.setProperty("--app-scale", appScale);
    localStorage.setItem("appScale", appScale);
  }, [appScale]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");

    try {
      if (mode === "register") {
        await register(username.trim(), password);
        setStatus("Account created. Login now.");
        setMode("login");
      } else {
        const tokens = await login(username.trim(), password);
        localStorage.setItem("accessToken", tokens.access);
        localStorage.setItem("refreshToken", tokens.refresh);
        setAccessToken(tokens.access);
        setStatus("");
        pushRoute("/browser");
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleAuthExpired() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setAccessToken("");
    setPassword("");
    setStatus("Session expired. Login again.");
    pushRoute("/login");
  }

  if (accessToken) {
    return (
      <ObjectBrowser
        appScale={appScale}
        routeBucket={route.bucket}
        token={accessToken}
        onAuthExpired={handleAuthExpired}
        onScaleChange={setAppScale}
        onSelectBucket={(bucket) => pushRoute(`/browser/${encodeURIComponent(bucket)}`)}
        onSignOut={() => {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          setAccessToken("");
          setPassword("");
          pushRoute("/login");
        }}
      />
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-copy" aria-label="Product overview">
        <div className="copy-content">
          <h1>High-Performance Object Store</h1>
          <p>
            MinIO is a cloud-native object store built to run on any infrastructure - public,
            private or edge clouds. Primary use cases include data lakes, databases, AI/ML,
            SaaS applications and fast backup & recovery.
          </p>
        </div>
        <WaveCanvas />
      </section>

      <section className="auth-panel" aria-label="Authentication">
        <ScaleControl scale={appScale} onScaleChange={setAppScale} />

        <div className="brand-lockup">
          <div className="brand-minio">MINIO</div>
          <div className="brand-title">OBJECT <span>STORE</span></div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="input-row">
            <User size={18} aria-hidden="true" />
            <input
              autoComplete="username"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="input-row">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="icon-button"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </label>

          <button
            className="submit-button"
            disabled={!canSubmit}
            title={mode === "login" ? "Login to object browser" : "Create new account"}
          >
            {isSubmitting ? "Working..." : mode === "login" ? "Login" : "Create account"}
          </button>

          {status ? <p className="form-status">{status}</p> : null}

          <button
            className="mode-button"
            type="button"
            title={mode === "login" ? "Switch to account registration" : "Switch to login"}
            onClick={() => {
              setStatus("");
              setMode((value) => (value === "login" ? "register" : "login"));
            }}
          >
            {mode === "login" ? "Need account? Register" : "Have account? Login"}
          </button>
        </form>

        <nav className="auth-links" aria-label="Resources">
          <a href="https://min.io/docs/minio/linux/index.html">Documentation</a>
          <a href="https://github.com/minio/minio">GitHub</a>
          <a href="https://min.io/product/support">Support</a>
          <a href="https://min.io/download">Download</a>
        </nav>
      </section>
    </main>
  );
}

function ObjectBrowser({ appScale, routeBucket, token, onAuthExpired, onScaleChange, onSelectBucket, onSignOut }) {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isPathModalOpen, setPathModalOpen] = useState(false);
  const [isPreviewModalOpen, setPreviewModalOpen] = useState(false);
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [isTagsModalOpen, setTagsModalOpen] = useState(false);
  const [isUploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [bucketName, setBucketName] = useState("");
  const [newFolderPath, setNewFolderPath] = useState("");
  const [shareDays, setShareDays] = useState(0);
  const [shareHours, setShareHours] = useState(12);
  const [shareMinutes, setShareMinutes] = useState(0);
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [buckets, setBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState("");
  const [objects, setObjects] = useState([]);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [selectedObject, setSelectedObject] = useState(null);
  const [pendingFolders, setPendingFolders] = useState([]);
  const [bucketFilter, setBucketFilter] = useState("");
  const [objectFilter, setObjectFilter] = useState("");
  const [status, setStatus] = useState("");
  const [isPathCopied, setPathCopied] = useState(false);
  const [isCreating, setCreating] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [isCreatingShare, setCreatingShare] = useState(false);
  const [isLoadingPreview, setLoadingPreview] = useState(false);
  const [isSavingTags, setSavingTags] = useState(false);

  const normalizedName = bucketName.trim().toLowerCase();
  const normalizedFolderPath = normalizeFolderPath(newFolderPath);
  const isValidBucketName = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(normalizedName);
  const canCreate = isValidBucketName && !isCreating;
  const canCreatePath = normalizedFolderPath.length > 0;
  const filteredBuckets = buckets.filter((bucket) =>
    bucket.name.toLowerCase().includes(bucketFilter.trim().toLowerCase())
  );
  const selected = buckets.find((bucket) => bucket.name === selectedBucket);
  const objectEntries = buildObjectEntries(objects, currentPrefix, objectFilter, pendingFolders);
  const objectCount = objects.length;
  const totalSize = objects.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  const currentPath = currentPrefix ? `${selected?.name || ""} / ${currentPrefix.split("/").filter(Boolean).join(" / ")}` : selected?.name;
  const displayedPath = selectedObject ? getObjectPath(selected?.name || "", selectedObject.key) : currentPath;
  const selectedMetadataEntries = selectedObject ? getMetadataEntries(selectedObject) : [];
  const selectedTagEntries = selectedObject ? getTagEntries(selectedObject) : [];

  useEffect(() => {
    refreshBuckets();
  }, []);

  useEffect(() => {
    setModalOpen(false);
    setPathModalOpen(false);
    setPreviewModalOpen(false);
    setShareModalOpen(false);
    setTagsModalOpen(false);
    if (routeBucket) setSelectedBucket(routeBucket);
  }, [routeBucket]);

  useEffect(() => {
    if (selectedBucket) refreshObjects(selectedBucket);
    else setObjects([]);
    setCurrentPrefix("");
    setSelectedObject(null);
    setPendingFolders([]);
    setPathCopied(false);
  }, [selectedBucket]);

  useEffect(() => {
    if (!isPathCopied) return undefined;
    const timeoutId = window.setTimeout(() => setPathCopied(false), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [isPathCopied]);

  async function refreshBuckets() {
    setLoading(true);
    setStatus("");
    try {
      const data = await listBuckets(token);
      const nextBuckets = (data.buckets || []).map((bucket) => ({
        name: bucket.name,
        createdAt: bucket.created_at,
      }));
      setBuckets(nextBuckets);
      setSelectedBucket((current) => {
        if (routeBucket && nextBuckets.some((bucket) => bucket.name === routeBucket)) return routeBucket;
        if (current && nextBuckets.some((bucket) => bucket.name === current)) return current;
        return nextBuckets[0]?.name || "";
      });
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshObjects(bucket) {
    setLoading(true);
    setStatus("");
    try {
      const data = await listObjects(token, bucket);
      const nextObjects = data.objects || [];
      setObjects(nextObjects);
      setSelectedObject((current) => {
        if (!current) return null;
        const nextSelected = nextObjects.find((item) => item.key === current.key);
        if (!nextSelected) return null;
        return {
          ...nextSelected,
          type: "file",
          name: current.name || getObjectDisplayName(nextSelected.key, currentPrefix),
        };
      });
      setPendingFolders((folders) =>
        folders.filter((folder) => !nextObjects.some((item) => item.key.startsWith(folder)))
      );
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBucket(event) {
    event.preventDefault();
    setCreating(true);
    setStatus("");

    try {
      const bucket = await createBucket(token, normalizedName);
      const created = {
        name: bucket.name,
        createdAt: new Date().toISOString(),
      };
      setBuckets((items) => [...items, created]);
      setSelectedBucket(bucket.name);
      onSelectBucket(bucket.name);
      setBucketName("");
      setModalOpen(false);
      setStatus(`Bucket "${bucket.name}" created.`);
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    } finally {
      setCreating(false);
    }
  }

  async function uploadFiles(files) {
    if (!selected || files.length === 0) return;
    setUploading(true);
    setStatus(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}...`);

    try {
      for (const file of files) {
        const key = `${currentPrefix}${file.webkitRelativePath || file.name}`;
        await uploadObject(token, selected.name, file, key);
      }
      setStatus(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}.`);
      await refreshObjects(selected.name);
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  function handleUploadFileChange(event) {
    uploadFiles(Array.from(event.target.files || []));
  }

  function handleUploadFolderChange(event) {
    uploadFiles(Array.from(event.target.files || []));
  }

  function handleCreatePath(event) {
    event.preventDefault();
    if (!canCreatePath) return;

    const folderKey = `${currentPrefix}${normalizedFolderPath}/`;
    setPendingFolders((folders) => (folders.includes(folderKey) ? folders : [...folders, folderKey]));
    setNewFolderPath("");
    setPathModalOpen(false);
    setStatus(`Path "${folderKey}" ready. Upload a file into it to persist it.`);
  }

  async function handleCopyPath() {
    if (!selected) return;

    const path = selectedObject ? `${selected.name}/${selectedObject.key}` : currentPrefix ? `${selected.name}/${currentPrefix}` : selected.name;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(path);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = path;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setPathCopied(true);
      setStatus(`Copied "${path}" to clipboard.`);
    } catch (error) {
      setPathCopied(false);
      setStatus("Could not copy path to clipboard.");
    }
  }

  async function handleDownloadObject() {
    if (!selected || !selectedObject) return;
    try {
      const blob = await downloadObject(token, selected.name, selectedObject.key);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = selectedObject.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatus(`Downloading "${selectedObject.name}".`);
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    }
  }

  async function createShareLink() {
    if (!selected || !selectedObject) return;
    const expiresIn = getShareExpirySeconds(shareDays, shareHours, shareMinutes);
    setCreatingShare(true);
    try {
      const data = await shareObject(token, selected.name, selectedObject.key, expiresIn);
      const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
      setShareUrl(data.url);
      setShareExpiresAt(expiresAt);
      setStatus(`Share link created for "${selectedObject.name}".`);
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    } finally {
      setCreatingShare(false);
    }
  }

  async function handleOpenPreview() {
    if (!selected || !selectedObject) return;
    setPreviewModalOpen(true);
    setPreviewUrl("");
    setLoadingPreview(true);
    try {
      const data = await shareObject(token, selected.name, selectedObject.key, 12 * 60 * 60, {
        preview: true,
      });
      setPreviewUrl(data.url);
      setStatus(`Preview opened for "${selectedObject.name}".`);
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
      setPreviewModalOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleOpenShare() {
    setShareUrl("");
    setShareExpiresAt("");
    setShareDays(0);
    setShareHours(12);
    setShareMinutes(0);
    setShareModalOpen(true);
  }

  async function handleCopyShareUrl() {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setStatus(`Share link copied for "${selectedObject.name}".`);
      } else {
        setStatus(`Share link: ${shareUrl}`);
      }
    } catch (error) {
      setStatus("Could not copy share link.");
    }
  }

  async function handleOpenTags() {
    if (!selected || !selectedObject) return;
    try {
      const data = await getObjectTags(token, selected.name, selectedObject.key);
      setTagDraft(formatTagLines(data.tags));
      setTagsModalOpen(true);
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    }
  }

  async function handleSaveTags(event) {
    event.preventDefault();
    if (!selected || !selectedObject) return;
    setSavingTags(true);
    try {
      const tags = parseTagLines(tagDraft);
      const data = await saveObjectTags(token, selected.name, selectedObject.key, tags);
      setObjects((items) =>
        items.map((item) => (item.key === selectedObject.key ? { ...item, tags: data.tags } : item))
      );
      setSelectedObject((item) => (item ? { ...item, tags: data.tags } : item));
      setTagsModalOpen(false);
      setStatus(`Tags saved for "${selectedObject.name}".`);
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    } finally {
      setSavingTags(false);
    }
  }

  async function handleDisplayVersions() {
    if (!selected || !selectedObject) return;
    try {
      const data = await listObjectVersions(token, selected.name, selectedObject.key);
      const count = data.versions?.length || 0;
      setStatus(
        count
          ? `${count} version${count === 1 ? "" : "s"} found for "${selectedObject.name}".`
          : `No object versions found for "${selectedObject.name}".`
      );
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    }
  }

  async function handleDeleteObject() {
    if (!selected || !selectedObject) return;
    const objectName = selectedObject.name;
    if (!window.confirm(`Delete "${objectName}"? This cannot be undone.`)) return;
    try {
      await deleteObject(token, selected.name, selectedObject.key);
      setObjects((items) => items.filter((item) => item.key !== selectedObject.key));
      setSelectedObject(null);
      setStatus(`Deleted "${objectName}".`);
    } catch (error) {
      if (error.status === 401) {
        onAuthExpired();
        return;
      }
      setStatus(error.message);
    }
  }

  return (
    <main className="browser-shell">
      <aside className="browser-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-minio">MINIO</div>
          <div className="sidebar-title">OBJECT <span>STORE</span></div>
          <button className="collapse-button" aria-label="Collapse sidebar" title="Collapse sidebar">
            <ArrowLeft size={20} />
          </button>
        </div>

        <button className="sidebar-action" title="Create a new bucket" onClick={() => setModalOpen(true)}>
          <span><Plus size={24} /></span>
          Create Bucket
        </button>

        <label className="bucket-filter">
          <Search size={21} aria-hidden="true" />
          <input
            placeholder="Filter Buckets"
            value={bucketFilter}
            onChange={(event) => setBucketFilter(event.target.value)}
          />
        </label>

        <div className="sidebar-section-title">Buckets</div>
        <div className="bucket-nav" aria-label="Buckets">
          {filteredBuckets.map((bucket) => (
            <button
              className={bucket.name === selectedBucket ? "bucket-nav-item active" : "bucket-nav-item"}
              key={bucket.name}
              title={`Open bucket ${bucket.name}`}
              onClick={() => onSelectBucket(bucket.name)}
            >
              <span><ShoppingBasket size={18} fill="currentColor" /></span>
              {bucket.name}
            </button>
          ))}
        </div>

        <div className="sidebar-spacer" />

        <a className="sidebar-link" href="https://min.io/docs/minio/linux/index.html">
          <span><BookOpenText size={18} /></span>
          Documentation
        </a>
        <a className="sidebar-link" href="https://min.io/docs/minio/linux/operations/install-deploy-manage/deploy-minio-community-edition.html">
          <span><ClipboardCheck size={18} /></span>
          License
        </a>
        <button className="sidebar-link signout" title="Sign out" onClick={onSignOut}>
          <span><LogOut size={18} /></span>
          Sign Out
        </button>
      </aside>

      <section className="browser-main">
        <header className="browser-header">
          <h1>Object Browser</h1>
          {selectedBucket ? (
            <label className="object-search">
              <Search size={22} />
              <input
                placeholder="Start typing to filter objects in the bucket"
                value={objectFilter}
                onChange={(event) => setObjectFilter(event.target.value)}
              />
            </label>
          ) : null}
          <div className="header-actions">
            <ScaleControl scale={appScale} onScaleChange={onScaleChange} />
            <button aria-label="Help" title="Help"><CircleHelp size={20} /></button>
            <button aria-label="Toggle dark mode" title="Toggle dark mode"><Moon size={20} /></button>
          </div>
        </header>

        <div className="browser-content">
          {selected ? (
            <section className="bucket-browser">
              <header className="bucket-browser-header">
                <div className="bucket-title-row">
                  <ShoppingBasket size={45} fill="currentColor" />
                  <div>
                    <h2>{selected.name}</h2>
                    <p>
                      Created on: <strong>{formatCreatedAt(selected.createdAt)}</strong>
                      <span>Access: <strong>PRIVATE</strong></span>
                      <span>{formatBytes(totalSize)} - {objectCount} Object{objectCount === 1 ? "" : "s"}</span>
                    </p>
                  </div>
                </div>
                <div className="bucket-toolbar">
                  <button disabled title="Restore earlier object versions">Rewind <RefreshCw size={18} /></button>
                  <button
                    onClick={() => refreshObjects(selected.name)}
                    title="Reload objects in this bucket"
                  >
                    Refresh <RefreshCw size={18} />
                  </button>
                  <div className="upload-menu-wrap">
                    <button
                      className="upload-button"
                      disabled={isUploading}
                      title="Upload files or folders"
                      onClick={() => setUploadMenuOpen((value) => !value)}
                    >
                      {isUploading ? "Uploading..." : "Upload"} <Upload size={20} />
                    </button>
                    {isUploadMenuOpen ? (
                      <div className="upload-menu">
                        <button
                          title="Choose files to upload"
                          onClick={() => {
                            setUploadMenuOpen(false);
                            fileInputRef.current?.click();
                          }}
                        >
                          <Upload size={28} /> Upload File
                        </button>
                        <button
                          title="Choose a folder to upload"
                          onClick={() => {
                            setUploadMenuOpen(false);
                            folderInputRef.current?.click();
                          }}
                        >
                          <Upload size={28} /> Upload Folder
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className={selectedObject ? "path-row path-row-with-panel" : "path-row"}>
                <button
                  aria-label="Back"
                  title="Go to parent path"
                  disabled={!currentPrefix}
                  onClick={() => {
                    setSelectedObject(null);
                    setCurrentPrefix((prefix) => getParentPrefix(prefix));
                  }}
                >
                  ‹
                </button>
                <div>{displayedPath}</div>
                <button
                  aria-label={isPathCopied ? "Path copied" : "Copy path"}
                  title={isPathCopied ? "Path copied" : "Copy path"}
                  onClick={handleCopyPath}
                >
                  {isPathCopied ? <ClipboardCheck size={18} /> : <Copy size={18} />}
                </button>
                <button
                  aria-label="Create new path"
                  className="path-create-button"
                  title="Create a folder-like path in this bucket"
                  onClick={() => setPathModalOpen(true)}
                >
                  Create new path <FolderPlus size={18} />
                </button>
              </div>

              <div className={selectedObject ? "object-workspace has-object-panel" : "object-workspace"}>
                {objectEntries.length === 0 ? (
                  <p className="empty-location">
                    {isLoading ? "Loading..." : "This location is empty, please try uploading a new file"}
                  </p>
                ) : (
                  <div className="object-table">
                    <div className="object-row object-row-header">
                      <span>Name</span>
                      <span>Last Modified</span>
                      <span>Size</span>
                    </div>
                    {objectEntries.map((item) => (
                      <button
                        className={[
                          "object-row",
                          item.type === "folder" ? "folder-row" : "file-row",
                          selectedObject?.key === item.key ? "selected" : "",
                        ].filter(Boolean).join(" ")}
                        key={item.key}
                        type="button"
                        title={item.type === "folder" ? `Open folder ${item.name}` : `View details for ${item.name}`}
                        onClick={() => {
                          if (item.type === "folder") {
                            setSelectedObject(null);
                            setCurrentPrefix(item.key);
                            return;
                          }
                          setSelectedObject(item);
                        }}
                      >
                        <span className="object-name">
                          {item.type === "folder" ? (
                            <Folder className="folder-icon" size={22} fill="currentColor" />
                          ) : (
                            <FileTypeIcon name={item.name} />
                          )}
                          {item.name}
                        </span>
                        <span>{item.last_modified ? formatCreatedAt(item.last_modified) : ""}</span>
                        <span>{item.type === "folder" ? "-" : formatBytes(item.size)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedObject ? (
                  <aside className="object-details-panel" aria-label="Object details">
                    <header className="object-details-header">
                      <FileTypeIcon name={selectedObject.name} />
                      <strong title={selectedObject.name}>{selectedObject.name}</strong>
                      <button
                        type="button"
                        aria-label="Close object details"
                        title="Close object details"
                        onClick={() => setSelectedObject(null)}
                      >
                        <X size={20} />
                      </button>
                    </header>

                    <section className="object-actions" aria-label="Object actions">
                      <h3>Actions:</h3>
                      <button
                        type="button"
                        title="Download selected object"
                        onClick={handleDownloadObject}
                      >
                        <Download size={18} /> Download
                      </button>
                      <button
                        type="button"
                        title="Share selected object"
                        onClick={handleOpenShare}
                      >
                        <Share2 size={18} /> Share
                      </button>
                      <button
                        type="button"
                        title="Preview selected object"
                        onClick={handleOpenPreview}
                      >
                        <Eye size={18} /> Preview
                      </button>
                      <button
                        type="button"
                        title="Edit object tags"
                        onClick={handleOpenTags}
                      >
                        <Tag size={18} /> Tags
                      </button>
                      <button
                        type="button"
                        title="Display object versions"
                        onClick={handleDisplayVersions}
                      >
                        <History size={18} /> Display Object Versions
                      </button>
                    </section>

                    <button
                      className="delete-object-button"
                      type="button"
                      title="Delete selected object"
                      onClick={handleDeleteObject}
                    >
                      <Trash2 size={20} /> Delete
                    </button>

                    <section className="object-info">
                      <div className="details-section-heading">
                        <h3>Object Info</h3>
                        <ShoppingBasket size={32} fill="currentColor" aria-hidden="true" />
                      </div>
                      <dl>
                        <div>
                          <dt>Name:</dt>
                          <dd>{selectedObject.name}</dd>
                        </div>
                        <div>
                          <dt>Path:</dt>
                          <dd>{`${selected.name}/${selectedObject.key}`}</dd>
                        </div>
                        <div>
                          <dt>Size:</dt>
                          <dd>{formatBytes(selectedObject.size)}</dd>
                        </div>
                        <div>
                          <dt>Last Modified:</dt>
                          <dd>{selectedObject.last_modified ? formatCreatedAt(selectedObject.last_modified) : "Unknown"}</dd>
                        </div>
                        <div>
                          <dt>ETAG:</dt>
                          <dd>{selectedObject.etag || "N/A"}</dd>
                        </div>
                        <div>
                          <dt>Tags:</dt>
                          <dd>
                            {selectedTagEntries.length
                              ? selectedTagEntries.map(([name, value]) => `${name}=${value}`).join(", ")
                              : "N/A"}
                          </dd>
                        </div>
                        <div>
                          <dt>Legal Hold:</dt>
                          <dd>Off</dd>
                        </div>
                        <div>
                          <dt>Retention Policy:</dt>
                          <dd>None</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="object-metadata">
                      <div className="details-section-heading">
                        <h3>Metadata</h3>
                        <FileText size={32} aria-hidden="true" />
                      </div>
                      <dl>
                        <div>
                          <dt>Content-Type</dt>
                          <dd>{getContentType(selectedObject)}</dd>
                        </div>
                        {selectedMetadataEntries.map(([name, value]) => (
                          <div key={name}>
                            <dt>{name}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </aside>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="bucket-card">
              <div className="bucket-heading">
                <ShoppingBasket size={42} fill="currentColor" />
                <h2>Buckets</h2>
              </div>
              <p>
                MinIO uses buckets to organize objects. A bucket is similar to a folder or
                directory in a filesystem, where each bucket can hold an arbitrary number of objects.
              </p>
              <p>
                To get started,{" "}
                <button
                  className="inline-link"
                  title="Create a new bucket"
                  onClick={() => setModalOpen(true)}
                >
                  Create a Bucket.
                </button>
              </p>
            </section>
          )}

          {status ? <p className="browser-status">{status}</p> : null}
        </div>
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="bucket-modal" onSubmit={handleCreateBucket}>
            <button
              className="modal-close"
              type="button"
              aria-label="Close"
              title="Close dialog"
              onClick={() => setModalOpen(false)}
            >
              <X size={42} />
            </button>
            <h2>Create Bucket</h2>
            <label>
              <span>Bucket Name*</span>
              <input
                autoFocus
                value={bucketName}
                onChange={(event) => setBucketName(event.target.value)}
                placeholder="my-bucket"
              />
            </label>
            {bucketName && !isValidBucketName ? <p className="modal-help invalid">Invalid bucket name</p> : null}
            {status ? <p className="modal-status">{status}</p> : null}
            <div className="modal-actions">
              <button type="button" title="Clear bucket name" onClick={() => {
                setBucketName("");
                setStatus("");
              }}>Clear</button>
              <button className="primary" disabled={!canCreate} title="Create bucket">
                {isCreating ? "Creating..." : "Create Bucket"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isPathModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="bucket-modal path-modal" onSubmit={handleCreatePath}>
            <button
              className="modal-close"
              type="button"
              aria-label="Close"
              title="Close dialog"
              onClick={() => setPathModalOpen(false)}
            >
              <X size={42} />
            </button>
            <h2>
              <FolderPlus className="path-mark" size={32} aria-hidden="true" />
              Choose or create a new path
            </h2>
            <p className="path-current">
              <strong>Current Path:</strong>
              <span>{currentPath}</span>
            </p>
            <label>
              <span>New Folder Path*</span>
              <input
                autoFocus
                value={newFolderPath}
                onChange={(event) => setNewFolderPath(event.target.value)}
                placeholder="Enter the new Folder Path"
              />
            </label>
            <div className="modal-actions">
              <button type="button" title="Clear folder path" onClick={() => setNewFolderPath("")}>Clear</button>
              <button className="primary" disabled={!canCreatePath} title="Create path">Create</button>
            </div>
          </form>
        </div>
      ) : null}

      {isPreviewModalOpen ? (
        <div className="modal-backdrop preview-backdrop" role="presentation">
          <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <button
              className="modal-close preview-close"
              type="button"
              aria-label="Close preview"
              title="Close preview"
              onClick={() => setPreviewModalOpen(false)}
            >
              <X size={42} />
            </button>
            <h2 id="preview-title">
              <Eye className="preview-title-icon" size={34} aria-hidden="true" />
              Preview - {selectedObject?.key}
            </h2>
            <div className="preview-notice">
              <strong>File Preview</strong>
              <p>
                This is a file preview. If you need to work with the full document,
                download the file instead.
              </p>
              <button type="button" title="Download file" onClick={handleDownloadObject}>
                Download File
              </button>
            </div>
            <div className="preview-frame-wrap">
              {isLoadingPreview ? (
                <div className="preview-loading">Loading preview...</div>
              ) : (
                <iframe
                  src={previewUrl}
                  title={`Preview ${selectedObject?.name || "object"}`}
                />
              )}
            </div>
          </section>
        </div>
      ) : null}

      {isShareModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
            <button
              className="modal-close"
              type="button"
              aria-label="Close"
              title="Close dialog"
              onClick={() => setShareModalOpen(false)}
            >
              <X size={42} />
            </button>
            <h2 id="share-title">
              <Share2 className="share-title-icon" size={34} aria-hidden="true" />
              Share File
            </h2>
            <p>
              The following URL lets you share this object without requiring a login.
              The URL expires automatically at the earlier of your configured time or the expiration
              of your current web session.
            </p>

            <div className="share-duration">
              <strong>Active for</strong>
              <label>
                <input
                  min="0"
                  max="7"
                  type="number"
                  value={shareDays}
                  onChange={(event) => setShareDays(event.target.value)}
                />
                Days
              </label>
              <label>
                <input
                  min="0"
                  max="168"
                  type="number"
                  value={shareHours}
                  onChange={(event) => setShareHours(event.target.value)}
                />
                Hours
              </label>
              <label>
                <input
                  min="0"
                  max="59"
                  type="number"
                  value={shareMinutes}
                  onChange={(event) => setShareMinutes(event.target.value)}
                />
                Minutes
              </label>
              <button
                className="share-generate-button"
                type="button"
                disabled={isCreatingShare}
                title="Create share link"
                onClick={() => createShareLink()}
              >
                {isCreatingShare ? "Creating..." : shareUrl ? "Refresh Link" : "Create Link"}
              </button>
            </div>

            <div className="share-expiry">
              <Link size={20} aria-hidden="true" />
              <span>Link will be available until:</span>
              <strong>{shareExpiresAt ? formatShareExpiryTime(shareExpiresAt) : "-"}</strong>
            </div>

            <div className="share-url-row">
              <input readOnly value={shareUrl} placeholder="Create a link to share this object" />
              <button
                type="button"
                aria-label="Copy share link"
                title="Copy share link"
                disabled={!shareUrl}
                onClick={handleCopyShareUrl}
              >
                <Copy size={24} />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isTagsModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="bucket-modal tags-modal" onSubmit={handleSaveTags}>
            <button
              className="modal-close"
              type="button"
              aria-label="Close"
              title="Close dialog"
              onClick={() => setTagsModalOpen(false)}
            >
              <X size={42} />
            </button>
            <h2>
              <Tag className="path-mark" size={32} aria-hidden="true" />
              Object Tags
            </h2>
            <p className="path-current">
              <strong>Object:</strong>
              <span>{selectedObject?.name}</span>
            </p>
            <label>
              <span>Tags</span>
              <textarea
                autoFocus
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                placeholder="department=finance&#10;env=prod"
              />
            </label>
            <p className="modal-help">Use one key=value pair per line.</p>
            <div className="modal-actions">
              <button type="button" title="Clear tags" onClick={() => setTagDraft("")}>Clear</button>
              <button className="primary" disabled={isSavingTags} title="Save object tags">
                {isSavingTags ? "Saving..." : "Save Tags"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        multiple
        onChange={handleUploadFileChange}
      />
      <input
        ref={folderInputRef}
        className="hidden-file-input"
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        onChange={handleUploadFolderChange}
      />
    </main>
  );
}

function formatCreatedAt(value) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

createRoot(document.getElementById("root")).render(<App />);
