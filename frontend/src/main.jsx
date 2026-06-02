import {
  ArrowLeft,
  BookOpenText,
  CircleHelp,
  ClipboardCheck,
  Copy,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Search,
  ShoppingBasket,
  Upload,
  Eye,
  EyeOff,
  LockKeyhole,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBucket, listBuckets, listObjects, login, register } from "./api";
import "./styles.css";

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
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  const canSubmit = username.trim() && password.length >= 8 && !isSubmitting;

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
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (accessToken) {
    return <ObjectBrowser token={accessToken} onSignOut={() => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setAccessToken("");
      setPassword("");
    }} />;
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
        <div className="brand-lockup">
          <div className="brand-minio">MINIO</div>
          <div className="brand-title">OBJECT <span>STORE</span></div>
          <div className="brand-badge">Community Edition</div>
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
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </label>

          <button className="submit-button" disabled={!canSubmit}>
            {isSubmitting ? "Working..." : mode === "login" ? "Login" : "Create account"}
          </button>

          {status ? <p className="form-status">{status}</p> : null}

          <button
            className="mode-button"
            type="button"
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

function ObjectBrowser({ token, onSignOut }) {
  const [isModalOpen, setModalOpen] = useState(false);
  const [bucketName, setBucketName] = useState("");
  const [buckets, setBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState("");
  const [objects, setObjects] = useState([]);
  const [bucketFilter, setBucketFilter] = useState("");
  const [objectFilter, setObjectFilter] = useState("");
  const [status, setStatus] = useState("");
  const [isCreating, setCreating] = useState(false);
  const [isLoading, setLoading] = useState(false);

  const normalizedName = bucketName.trim().toLowerCase();
  const isValidBucketName = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(normalizedName);
  const canCreate = isValidBucketName && !isCreating;
  const filteredBuckets = buckets.filter((bucket) =>
    bucket.name.toLowerCase().includes(bucketFilter.trim().toLowerCase())
  );
  const selected = buckets.find((bucket) => bucket.name === selectedBucket);
  const filteredObjects = objects.filter((item) =>
    item.key.toLowerCase().includes(objectFilter.trim().toLowerCase())
  );

  useEffect(() => {
    refreshBuckets();
  }, []);

  useEffect(() => {
    if (selectedBucket) refreshObjects(selectedBucket);
    else setObjects([]);
  }, [selectedBucket]);

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
      setSelectedBucket((current) => current || nextBuckets[0]?.name || "");
    } catch (error) {
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
      setObjects(data.objects || []);
    } catch (error) {
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
      setBucketName("");
      setModalOpen(false);
      setStatus(`Bucket "${bucket.name}" created.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="browser-shell">
      <aside className="browser-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-minio">MINIO</div>
          <div className="sidebar-title">OBJECT <span>STORE</span></div>
          <div className="sidebar-badge">Community Edition</div>
          <button className="collapse-button" aria-label="Collapse sidebar">
            <ArrowLeft size={20} />
          </button>
        </div>

        <button className="sidebar-action" onClick={() => setModalOpen(true)}>
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
              onClick={() => setSelectedBucket(bucket.name)}
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
        <button className="sidebar-link signout" onClick={onSignOut}>
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
            <button aria-label="Help"><CircleHelp size={20} /></button>
            <button aria-label="Toggle dark mode"><Moon size={20} /></button>
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
                    </p>
                  </div>
                </div>
                <div className="bucket-toolbar">
                  <button disabled>Rewind <RefreshCw size={18} /></button>
                  <button onClick={() => refreshObjects(selected.name)}>Refresh <RefreshCw size={18} /></button>
                  <button className="upload-button">Upload <Upload size={20} /></button>
                </div>
              </header>

              <div className="path-row">
                <button aria-label="Back">‹</button>
                <div>{selected.name}</div>
                <button aria-label="Copy path"><Copy size={18} /></button>
                <button>Create new path <span>:%</span></button>
              </div>

              {filteredObjects.length === 0 ? (
                <p className="empty-location">
                  {isLoading ? "Loading..." : "This location is empty, please try uploading a new file"}
                </p>
              ) : (
                <div className="object-table">
                  {filteredObjects.map((item) => (
                    <div className="object-row" key={item.key}>
                      <span>{item.key}</span>
                      <span>{formatBytes(item.size)}</span>
                    </div>
                  ))}
                </div>
              )}
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
                <button className="inline-link" onClick={() => setModalOpen(true)}>
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
            <button className="modal-close" type="button" aria-label="Close" onClick={() => setModalOpen(false)}>
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
              <button type="button" onClick={() => {
                setBucketName("");
                setStatus("");
              }}>Clear</button>
              <button className="primary" disabled={!canCreate}>
                {isCreating ? "Creating..." : "Create Bucket"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
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
