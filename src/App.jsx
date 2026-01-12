import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "touxdoux_tasks_v1";
const THEME_KEY = "touxdoux_theme_v1";

// ✅ API helpers (works with Vite proxy; supports cookie sessions)
const API = {
  upload: "/api/upload",
  file: (id) => `/api/files/${encodeURIComponent(id)}`, // private download endpoint
};

async function apiJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Request failed");
  }
  return res.json();
}

function uid() {
  // ✅ collision-resistant
  return crypto.randomUUID();
}

function toISODate(d) {
  // yyyy-mm-dd in local time
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODate(iso) {
  // Treat as local date (not UTC midnight shifting)
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // move back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDisplayDate(dateObj) {
  // Format date as "25 Dec 2025"
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = dateObj.getDate();
  const month = months[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day} ${month} ${year}`;
}

function isOverdue(task, todayISO) {
  return task.status === "incomplete" && task.dueDate && task.dueDate < todayISO;
}

/**
 * Task shape:
 * {
 *  id, title, notes, priority, status,
 *  createdAt (ISO datetime), dueDate (ISO yyyy-mm-dd or ""),
 *  project: "Work"|"Personal"|"" ,
 *  attachmentId: string|null,
 *  attachmentName: string|null
 * }
 */

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function TaskModal({ open, mode, initialTask, onCancel, onSave, onDelete, onUploadFile }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState(1);
  const [project, setProject] = useState(""); // "" none, "Work", "Personal"
  const [status, setStatus] = useState("incomplete");
  const [error, setError] = useState("");
  // ✅ attachment now stores { id, name } not a public path
  const [attachment, setAttachment] = useState(null); // { id: '', name: '' }
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = initialTask || null;
    setTitle(t?.title ?? "");
    setNotes(t?.notes ?? "");
    setDueDate(t?.dueDate ?? "");
    setPriority(Number.isFinite(t?.priority) ? t.priority : 1);
    setProject(t?.project ?? "Work");
    setStatus(t?.status ?? "incomplete");
    setAttachment(t?.attachmentId ? { id: t.attachmentId, name: t.attachmentName } : null);
    setError("");
    setIsUploading(false);
  }, [open, initialTask]);

  const titleRef = useRef(null);
  useEffect(() => {
    if (open) setTimeout(() => titleRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!onUploadFile) {
      setError("File upload not supported in this version.");
      return;
    }

    setIsUploading(true);
    try {
      const result = await onUploadFile(file);
      // ✅ expects { id, originalName }
      setAttachment({ id: result.id, name: result.originalName });
    } catch (err) {
      console.error(err);
      setError("Failed to upload file.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleSave() {
    if (!title.trim()) {
      setError("Title required.");
      return;
    }
    const cleaned = {
      title: title.trim(),
      notes: notes.trim() ? notes.trim() : "",
      dueDate: dueDate || "",
      priority: Math.max(1, Number(priority) || 1),
      project: project || "",
      status,
      // ✅ store attachment id, not a public path
      attachmentId: attachment?.id || null,
      attachmentName: attachment?.name || null,
    };
    onSave(cleaned);
  }

  return (
    <div className="modalBackdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>{mode === "edit" ? "Edit Task" : "Add Task"}</h2>
          <button className="iconBtn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modalBody">
          {error ? <div className="error">{error}</div> : null}

          <div className="field">
            <label>Title *</label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="What needs doing?"
            />
          </div>

          <div className="field">
            <label>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Details, links, context…"
            />
          </div>

          <div className="row2">
            <div className="field">
              <label>Due date (optional)</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="field">
              <label>Priority (number)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
          </div>

          <div className="row2">
            <div className="field">
              <label>Project (optional)</label>
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">None</option>
                <option value="Work">Work</option>
                <option value="Personal">Personal</option>
              </select>
            </div>

            <div className="field">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="incomplete">Incomplete</option>
                <option value="complete">Complete</option>
              </select>
            </div>
          </div>

          <div className="field" style={{ marginTop: "10px" }}>
            <label>Attachment (optional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                type="file"
                onChange={handleFileChange}
                disabled={isUploading}
                style={{ fontSize: "12px" }}
              />
              {isUploading && <span style={{ fontSize: "12px", color: "#666" }}>Uploading...</span>}
            </div>
            {attachment && !isUploading && (
              <div style={{ marginTop: "5px", fontSize: "12px", color: "#2c5282" }}>
                Attached: <strong>{attachment.name}</strong>
                <button
                  onClick={() => setAttachment(null)}
                  style={{
                    marginLeft: "10px",
                    background: "none",
                    border: "none",
                    color: "#e53e3e",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  (Remove)
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="modalFooter">
          {mode === "edit" ? (
            <button className="dangerBtn" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <button className="secondaryBtn" onClick={onCancel}>
            Cancel
          </button>
          <button className="primaryBtn" onClick={handleSave} disabled={isUploading}>
            {isUploading ? "Uploading..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkTaskModal({ open, onCancel, onExport }) {
  const [bulkText, setBulkText] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open) {
      setBulkText("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  function handleExport() {
    const lines = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return;

    onExport(lines);
    setBulkText("");
  }

  return (
    <div className="modalBackdrop" onMouseDown={onCancel}>
      <div className="bulkModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>Add Multiple Tasks</h2>
          <button className="iconBtn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="bulkModalBody">
          <p className="bulkInstructions">Enter one task per line. Press Enter to add a new line.</p>
          <textarea
            ref={textareaRef}
            className="bulkTextarea"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"Task 1\nTask 2\nTask 3\n..."}
          />
        </div>

        <div className="modalFooter">
          <button className="secondaryBtn" onClick={onCancel}>
            Cancel
          </button>
          <button className="goldBtn" onClick={handleExport}>
            Export Tasks
          </button>
        </div>
      </div>
    </div>
  );
}

function PrintTasksModal({ open, onCancel, tasks, formatDate }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showPreview, setShowPreview] = useState(false);
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const printRef = useRef(null);

  useEffect(() => {
    if (open) {
      // Default to last 30 days
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      setStartDate(toISODate(thirtyDaysAgo));
      setEndDate(toISODate(today));
      setShowPreview(false);
      setProjectFilter("all");
      setExcludedIds(new Set());
      setPosition({ x: 0, y: 0 });
    }
  }, [open]);

  function handleMouseDown(e) {
    if (e.target.closest(".iconBtn")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  if (!open) return null;

  const todayISO = toISODate(new Date());

  const filteredTasks = tasks.filter((t) => {
    if (!t.dueDate) return false;
    if (excludedIds.has(t.id)) return false;
    if (projectFilter !== "all" && t.project !== projectFilter) return false;
    return t.dueDate >= startDate && t.dueDate <= endDate;
  });

  const doneTasks = filteredTasks.filter((t) => t.status === "complete");
  const overdueTasks = filteredTasks.filter((t) => t.status === "incomplete" && t.dueDate < todayISO);

  function handleGeneratePreview() {
    setShowPreview(true);
  }

  function handleRemoveFromReport(taskId) {
    setExcludedIds((prev) => new Set([...prev, taskId]));
  }

  function handleExportPDF() {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>TOUXDOUX - Task Report</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background: white;
            color: #333;
          }
          .report-header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }
          .report-title { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
          .report-date { font-size: 12px; color: #666; }
          .section { margin-bottom: 30px; }
          .section-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 12px;
            padding: 8px 12px;
            background: #f0f0f0;
            border-radius: 4px;
          }
          .section-title.done { background: #d4edda; color: #155724; }
          .section-title.overdue { background: #f8d7da; color: #721c24; }
          .task-item {
            padding: 8px 12px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
          }
          .task-title { font-size: 13px; }
          .task-date { font-size: 11px; color: #666; }
          .no-tasks { color: #999; font-style: italic; padding: 12px; }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #999;
            border-top: 1px solid #ddd;
            padding-top: 20px;
          }
          .remove-btn { display: none; }
          @media print {
            body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }

  return (
    <div className="modalBackdrop" onMouseDown={onCancel}>
      <div
        className="printModal draggable"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="modalHeader dragHandle"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          <h2>Print Tasks Report</h2>
          <button className="iconBtn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="printModalBody">
          <div className="dateRangeSelector">
            <div className="dateField">
              <label>From:</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="dateField">
              <label>To:</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="dateField">
              <label>Project:</label>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                style={{ height: "32px", padding: "0 8px", borderRadius: "4px", border: "1px solid #445" }}
              >
                <option value="all">All Projects</option>
                <option value="Work">Work Only</option>
                <option value="Personal">Personal Only</option>
              </select>
            </div>
            <button className="blackBtn" onClick={handleGeneratePreview}>
              Generate Preview
            </button>
          </div>

          {showPreview && (
            <div className="a4Preview">
              <div className="a4Page" ref={printRef}>
                <div className="report-header">
                  <div className="report-title">TOUXDOUX - Task Report</div>
                  <div className="report-date">
                    Period: {formatDate(parseISODate(startDate))} — {formatDate(parseISODate(endDate))}
                  </div>
                </div>

                <div className="section">
                  <div className="section-title done">✓ Completed Tasks ({doneTasks.length})</div>
                  {doneTasks.length === 0 ? (
                    <div className="no-tasks">No completed tasks in this period</div>
                  ) : (
                    doneTasks.map((t) => (
                      <div className="task-item" key={t.id}>
                        <span className="task-title">{t.title}</span>
                        <span className="task-date">{formatDate(parseISODate(t.dueDate))}</span>
                        <button className="remove-btn" onClick={() => handleRemoveFromReport(t.id)} title="Remove from report">
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="section">
                  <div className="section-title overdue">⚠ Overdue Tasks ({overdueTasks.length})</div>
                  {overdueTasks.length === 0 ? (
                    <div className="no-tasks">No overdue tasks in this period</div>
                  ) : (
                    overdueTasks.map((t) => (
                      <div className="task-item" key={t.id}>
                        <span className="task-title">{t.title}</span>
                        <span className="task-date">{formatDate(parseISODate(t.dueDate))}</span>
                        <button className="remove-btn" onClick={() => handleRemoveFromReport(t.id)} title="Remove from report">
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="footer">Generated on {formatDate(new Date())} • TOUXDOUX © Wael Ibrahim 2026</div>
              </div>
            </div>
          )}
        </div>

        <div className="modalFooter">
          <button className="blackBtn" onClick={onCancel}>
            Cancel
          </button>
          {showPreview && (
            <button className="softRedBtn" onClick={handleExportPDF}>
              Export to PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function ThemeSelector({ open, onClose, currentTheme, onThemeChange }) {
  const themes = [
    { id: "cinnamon", name: "Cinnamon", color: "#f5e6d3" },
    { id: "neutral-gray", name: "Neutral Gray", color: "#e0e0e0" },
    { id: "dark-mode", name: "Dark Mode", color: "#e9ecf1" },
    { id: "blue-gray", name: "Blue Gray", color: "#e1e8f0" },
    { id: "rose-quartz", name: "Rose Quartz", color: "#f5e6ea" },
  ];

  if (!open) return null;

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div className="themeModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>SELECT THEME</h2>
          <button className="iconBtn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="themeList">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className={`themeOption ${currentTheme === theme.id ? "selected" : ""}`}
              onClick={() => {
                onThemeChange(theme.id);
                onClose();
              }}
            >
              <div className="themeSwatch" style={{ backgroundColor: theme.color }}></div>
              <span className="themeName">{theme.name}</span>
              {currentTheme === theme.id && <span className="themeCheck">✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ open, onCancel }) {
  const [downloadLocation, setDownloadLocation] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    apiJSON("/api/settings")
      .then((data) => {
        setDownloadLocation(data.downloadLocation || "");
        // setExportLocation(data.exportLocation || ""); // Unused
      })
      .catch((err) => {
        setError(err.message || "Failed to load settings");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open]);

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      await apiJSON("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          downloadLocation: downloadLocation.trim() || null,
          // exportLocation: exportLocation.trim() || null,
        }),
      });
      onCancel();
    } catch (err) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modalBackdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>Settings</h2>
          <button className="iconBtn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modalBody">
          {error ? <div className="error">{error}</div> : null}

          {loading ? (
            <div style={{ padding: "20px", textAlign: "center" }}>Loading settings...</div>
          ) : (
            <>
              <div className="field">
                <label>File Viewing Preference</label>
                <p style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
                  Choose how you want to view attached files.
                </p>
                <select
                  value={downloadLocation}
                  onChange={(e) => setDownloadLocation(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                >
                  <option value="">Preview in browser (Default)</option>
                  <option value="download">Always Download</option>
                </select>
              </div>

              {/* Export location removed as it was unused/confusing in web context */}

              <div className="field" style={{ marginTop: "20px", padding: "12px", background: "#f5f5f5", borderRadius: "4px" }}>
                <strong style={{ fontSize: "13px" }}>Account Storage</strong>
                <div style={{ fontSize: "12px", color: "#666", marginTop: "8px" }}>
                  <div>• Cloud Storage: <strong>Active</strong></div>
                  <div>• Your data is securely stored on the server.</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modalFooter">
          <button className="secondaryBtn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="primaryBtn" onClick={handleSave} disabled={loading || saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiJSON(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authContainer">
      <h1>TOUXDOUX</h1>

      <form className="authBox" onSubmit={submit}>
        <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>

        {error && <div className="error">{error}</div>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />

        <button className="primaryBtn" disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Login" : "Register"}
        </button>

        <p style={{ marginTop: 10 }}>
          {mode === "login" ? (
            <>
              No account?{" "}
              <button type="button" onClick={() => setMode("register")} className="linkBtn">
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => setMode("login")} className="linkBtn">
                Login
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
export default function App() {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved || "dark-mode";
  });
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Apply theme on mount and when it changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const [lastDeleted, setLastDeleted] = useState(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undoDelete();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDeleted, tasks]);

  function permanentlyDelete(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setLastDeleted(task);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function undoDelete() {
    if (!lastDeleted) return;
    setTasks((prev) => [lastDeleted, ...prev]);
    setLastDeleted(null);
  }

  // ✅ Upload uses proxy URL + cookie session support
  async function handleUpload(file) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(API.upload, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Upload failed");
    }

    // Expect server to return: { id, originalName, ... }
    return res.json();
  }

  const [filter, setFilter] = useState("all"); // all|active|completed
  const [sort, setSort] = useState("default"); // default|due|priority|created
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // add|edit
  const [editingId, setEditingId] = useState(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const todayISO = toISODate(new Date());
  const weekStart = useMemo(() => {
    const baseMonday = startOfWeekMonday(new Date());
    return addDays(baseMonday, weekOffset * 7);
  }, [weekOffset]);

  const weekDays = useMemo(() => {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return names.map((name, i) => {
      const dateObj = addDays(weekStart, i);
      const iso = toISODate(dateObj);
      return {
        name,
        iso,
        dateObj,
        displayDate: formatDisplayDate(dateObj),
        isWeekend: name === "Sat" || name === "Sun",
        isToday: iso === todayISO,
        isPast: iso < todayISO,
        isFuture: iso > todayISO,
      };
    });
  }, [weekStart, todayISO]);

  const editingTask = useMemo(() => tasks.find((t) => t.id === editingId) || null, [tasks, editingId]);

  function openAdd() {
    setModalMode("add");
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(taskId) {
    setModalMode("edit");
    setEditingId(taskId);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  function handleSaveFromModal(fields) {
    if (modalMode === "add") {
      const newTask = {
        id: uid(),
        title: fields.title,
        notes: fields.notes,
        priority: fields.priority,
        status: fields.status,
        createdAt: new Date().toISOString(),
        dueDate: fields.dueDate || todayISO,
        project: fields.project,
        // ✅
        attachmentId: fields.attachmentId,
        attachmentName: fields.attachmentName,
      };
      setTasks((prev) => [newTask, ...prev]);
      setModalOpen(false);
      return;
    }

    setTasks((prev) =>
      prev.map((t) =>
        t.id === editingId
          ? {
            ...t,
            title: fields.title,
            notes: fields.notes,
            priority: fields.priority,
            status: fields.status,
            dueDate: fields.dueDate,
            project: fields.project,
            // ✅
            attachmentId: fields.attachmentId,
            attachmentName: fields.attachmentName,
          }
          : t
      )
    );
    setModalOpen(false);
  }

  function handleDelete() {
    if (!editingId) return;
    const ok = confirm("Delete this task?");
    if (!ok) return;
    setTasks((prev) => prev.filter((t) => t.id !== editingId));
    setModalOpen(false);
  }

  function handleBulkExport(taskTitles) {
    const newTasks = taskTitles.map((title, index) => ({
      id: uid(),
      title,
      notes: "",
      priority: index + 1,
      status: "incomplete",
      createdAt: new Date().toISOString(),
      dueDate: todayISO,
      project: "",
      attachmentId: null,
      attachmentName: null,
    }));
    setTasks((prev) => [...newTasks, ...prev]);
    setBulkModalOpen(false);
  }

  function toggleComplete(taskId) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        if (t.status === "complete") {
          return { ...t, status: "incomplete", priority: t.previousPriority || t.priority || 1 };
        } else {
          return { ...t, status: "complete", previousPriority: t.priority };
        }
      })
    );
  }

  function moveTaskUp(taskId, dayISO) {
    setTasks((prev) => {
      const dayTasks = prev.filter((t) => t.dueDate === dayISO && t.status === "incomplete");
      dayTasks.sort((a, b) => (a.priority || 1) - (b.priority || 1));
      const idx = dayTasks.findIndex((t) => t.id === taskId);
      if (idx <= 0) return prev;

      const newPriorities = new Map();
      dayTasks.forEach((t, i) => {
        if (i === idx - 1) newPriorities.set(t.id, idx + 1);
        else if (i === idx) newPriorities.set(t.id, idx);
        else newPriorities.set(t.id, i + 1);
      });

      return prev.map((t) => (newPriorities.has(t.id) ? { ...t, priority: newPriorities.get(t.id) } : t));
    });
  }

  function moveTaskDown(taskId, dayISO) {
    setTasks((prev) => {
      const dayTasks = prev.filter((t) => t.dueDate === dayISO && t.status === "incomplete");
      dayTasks.sort((a, b) => (a.priority || 1) - (b.priority || 1));
      const idx = dayTasks.findIndex((t) => t.id === taskId);
      if (idx < 0 || idx >= dayTasks.length - 1) return prev;

      const newPriorities = new Map();
      dayTasks.forEach((t, i) => {
        if (i === idx) newPriorities.set(t.id, idx + 2);
        else if (i === idx + 1) newPriorities.set(t.id, idx + 1);
        else newPriorities.set(t.id, i + 1);
      });

      return prev.map((t) => (newPriorities.has(t.id) ? { ...t, priority: newPriorities.get(t.id) } : t));
    });
  }

  const filteredTasks = useMemo(() => {
    let out = [...tasks];
    if (filter === "active") out = out.filter((t) => t.status === "incomplete");
    if (filter === "completed") out = out.filter((t) => t.status === "complete");

    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((t) => {
        const hay = `${t.title} ${t.notes || ""} ${t.project || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return out;
  }, [tasks, filter, search]);

  const sortedTasks = useMemo(() => {
    const out = [...filteredTasks];

    function defaultRank(t) {
      const overdue = isOverdue(t, todayISO) ? 0 : 1;
      const hasDue = t.dueDate ? 0 : 1;
      const dueVal = t.dueDate ? t.dueDate : "9999-12-31";
      const completed = t.status === "complete" ? 1 : 0;
      return [completed, overdue, hasDue, dueVal, -(t.priority || 1), t.createdAt || ""];
    }

    function cmp(a, b) {
      const ra = defaultRank(a);
      const rb = defaultRank(b);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] < rb[i]) return -1;
        if (ra[i] > rb[i]) return 1;
      }
      return 0;
    }

    if (sort === "default") {
      out.sort(cmp);
      return out;
    }

    if (sort === "due") {
      out.sort((a, b) => {
        if (a.status !== b.status) return a.status === "complete" ? 1 : -1;
        const ao = isOverdue(a, todayISO);
        const bo = isOverdue(b, todayISO);
        if (ao !== bo) return ao ? -1 : 1;
        const ad = a.dueDate || "9999-12-31";
        const bd = b.dueDate || "9999-12-31";
        if (ad < bd) return -1;
        if (ad > bd) return 1;
        return (b.priority || 1) - (a.priority || 1);
      });
      return out;
    }

    if (sort === "priority") {
      out.sort((a, b) => {
        if (a.status !== b.status) return a.status === "complete" ? 1 : -1;

        // NOTE: your app treats lower number as higher priority in columns.
        // This comparator uses higher-number-first. Keep as-is for now to avoid behavior change.
        // If you want consistent meaning, tell me and I’ll unify it everywhere.
        const ap = a.priority || 1;
        const bp = b.priority || 1;
        if (bp !== ap) return bp - ap;

        const ao = isOverdue(a, todayISO);
        const bo = isOverdue(b, todayISO);
        if (ao !== bo) return ao ? -1 : 1;

        const ad = a.dueDate || "9999-12-31";
        const bd = b.dueDate || "9999-12-31";
        if (ad < bd) return -1;
        if (ad > bd) return 1;
        return (a.createdAt || "") > (b.createdAt || "") ? -1 : 1;
      });
      return out;
    }

    if (sort === "created") {
      out.sort((a, b) => {
        if (a.status !== b.status) return a.status === "complete" ? 1 : -1;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      return out;
    }

    out.sort(cmp);
    return out;
  }, [filteredTasks, sort, todayISO]);

  const tasksByDayISO = useMemo(() => {
    const map = new Map();
    for (const day of weekDays) map.set(day.iso, { active: [], completed: [] });
    const weekStartISO = weekDays[0].iso;
    const weekEndISO = weekDays[6].iso;

    for (const t of sortedTasks) {
      if (t.dueDate && t.dueDate >= weekStartISO && t.dueDate <= weekEndISO) {
        if (map.has(t.dueDate)) {
          const bucket = map.get(t.dueDate);
          if (t.status === "complete") bucket.completed.push(t);
          else bucket.active.push(t);
        }
      }
    }

    for (const [, bucket] of map) {
      bucket.active.sort((a, b) => (a.priority || 1) - (b.priority || 1));
    }

    return map;
  }, [sortedTasks, weekDays]);

  const [dragOverDay, setDragOverDay] = useState("");
  const [zoomedColumn, setZoomedColumn] = useState(null);

  function onDragStart(e, taskId) {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(e, dayISO) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: dayISO } : t)));
    setDragOverDay("");
  }

  function onDragOver(e, dayISO) {
    e.preventDefault();
    setDragOverDay(dayISO);
  }

  function onDragLeave(e, dayISO) {
    if (dragOverDay === dayISO) setDragOverDay("");
  }

  return (
    <div className="container">
      <div className="topbar">
        <div className="controls">
          <div className="pill">
            <label>Filter</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="pill">
            <label>Sort</label>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="default">Default</option>
              <option value="due">Due date</option>
              <option value="priority">Priority</option>
              <option value="created">Created</option>
            </select>
          </div>

          <div className="pill">
            <label>Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="optional v1" style={{ width: 160 }} />
          </div>

          <button className="primaryBtn" onClick={openAdd}>
            + Add Task
          </button>
          <button className="goldBtn" onClick={() => setBulkModalOpen(true)}>
            + Add Tasks
          </button>
          <button className="softRedBtn" onClick={() => setPrintModalOpen(true)}>
            {"{print tasks}"}
          </button>
          <button className="secondaryBtn" onClick={() => setSettingsModalOpen(true)} title="Settings">
            ⚙️ Settings
          </button>
          <button className="themeBtn" onClick={() => setThemeModalOpen(true)} title="Change Theme">
            <span>Theme</span>
            <span className="themeIcon">☀️</span>
          </button>
        </div>

        <div className="branding">
          <h1 className="appTitle">TOUXDOUX</h1>
          <div className="copyright">
            <span className="copyright-line">Private and Confidential</span>
            <span className="copyright-line">Wael Ibrahim © 2026</span>
            <span className="version">v1.23</span>
          </div>
        </div>
      </div>

      <div className="weekNav">
        <button onClick={() => setWeekOffset((prev) => prev - 1)}>← Previous</button>
        <span className="weekLabel">
          {weekDays[0].displayDate} — {weekDays[6].displayDate}
        </span>
        <button onClick={() => setWeekOffset((prev) => prev + 1)}>Next →</button>
        {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)}>Today</button>}
      </div>

      <div className="board">
        <div
          className={"navColumn prevWeek" + (dragOverDay === "prev" ? " dragOver" : "")}
          onClick={() => setWeekOffset((prev) => prev - 1)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverDay("prev");
          }}
          onDragLeave={() => setDragOverDay("")}
          onDrop={(e) => {
            e.preventDefault();
            const taskId = e.dataTransfer.getData("text/plain");
            setDragOverDay("");
            const prevWeekMonday = addDays(weekStart, -7);
            const prevWeekMondayISO = toISODate(prevWeekMonday);
            if (taskId) setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: prevWeekMondayISO } : t)));
            setWeekOffset((prev) => prev - 1);
          }}
        >
          <span className="navColumnText">Previous Week</span>
        </div>

        {weekDays.map((day) => {
          const bucket = tasksByDayISO.get(day.iso) || { active: [], completed: [] };
          const { active: activeTasks, completed: completedTasks } = bucket;
          const columnClasses = [
            "column",
            day.isWeekend ? "weekend" : "",
            day.isToday ? "today" : "",
            day.isPast ? "past" : "",
            day.isFuture && !day.isToday ? "future" : "",
            zoomedColumn === day.iso ? "zoomed" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const handleColumnDoubleClick = (e) => {
            if (e.target.closest(".card") || e.target.closest(".completedTask")) return;
            setZoomedColumn((prev) => (prev === day.iso ? null : day.iso));
          };

          return (
            <div className={columnClasses} key={day.iso} onDoubleClick={handleColumnDoubleClick}>
              <div className="colHeader">
                <div className="dayName">{day.name}</div>
                <div className="dayDate">{day.displayDate}</div>
                {zoomedColumn !== day.iso && <div className="zoomHint">Double-click to expand</div>}
              </div>

              <div className={"dropZone" + (dragOverDay === day.iso ? " dragOver" : "")} onDrop={(e) => onDrop(e, day.iso)} onDragOver={(e) => onDragOver(e, day.iso)} onDragLeave={(e) => onDragLeave(e, day.iso)}>
                {activeTasks.map((t, idx) => {
                  const overdue = isOverdue(t, todayISO);
                  const cardClasses = ["card", t.project === "Personal" ? "personal" : ""].filter(Boolean).join(" ");
                  return (
                    <div className={cardClasses} key={t.id} draggable onDragStart={(e) => onDragStart(e, t.id)} onDoubleClick={() => openEdit(t.id)} title="Double-click to edit. Drag to move.">
                      <div className="cardTop">
                        <input className="checkbox" type="checkbox" checked={false} onChange={() => toggleComplete(t.id)} onClick={(e) => e.stopPropagation()} />

                        <div style={{ width: "100%" }}>
                          <div className="cardTitleRow">
                            <div className="priorityBadge">{idx + 1}</div>
                            <p className="cardTitle">{t.title}</p>

                            <div className="cardActions">
                              <button className="iconBtn moveBtn" onClick={(e) => { e.stopPropagation(); moveTaskUp(t.id, day.iso); }} aria-label="Move up" disabled={idx === 0}>
                                ▲
                              </button>
                              <button className="iconBtn moveBtn" onClick={(e) => { e.stopPropagation(); moveTaskDown(t.id, day.iso); }} aria-label="Move down" disabled={idx === activeTasks.length - 1}>
                                ▼
                              </button>
                              <button className="iconBtn" onClick={(e) => { e.stopPropagation(); openEdit(t.id); }} aria-label="Edit">
                                ✎
                              </button>
                            </div>
                          </div>

                          <div className="meta">
                            {t.project ? <span className="chip">{t.project}</span> : null}
                            {overdue ? <span className="chip overdue">Overdue</span> : null}
                          </div>

                          {/* ✅ Private attachment link */}
                          {t.attachmentId && (
                            <div className="attachment" onClick={(e) => e.stopPropagation()}>
                              <a href={API.file(t.attachmentId)} target="_blank" rel="noopener noreferrer" className="attachmentLink">
                                📎 {t.attachmentName || "Attachment"}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {activeTasks.length === 0 && completedTasks.length === 0 ? (
                  <div style={{ color: "rgba(170,179,194,0.7)", fontSize: 12, padding: 6 }}>Drop tasks here</div>
                ) : null}

                {completedTasks.length > 0 && (
                  <div className="completedSection">
                    <div className="completedHeader">Done ({completedTasks.length})</div>
                    {completedTasks.map((t) => (
                      <div className="completedTask" key={t.id} style={{ position: "relative", paddingRight: "45px" }}>
                        <input className="checkbox small" type="checkbox" checked={true} onChange={() => toggleComplete(t.id)} onClick={(e) => e.stopPropagation()} title="Click to restore task" />
                        <span className="completedTitle">{t.title}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            permanentlyDelete(t.id);
                          }}
                          className="permanentDeleteBtn"
                          title="Permanently Delete"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div
          className={"navColumn nextWeek" + (dragOverDay === "next" ? " dragOver" : "")}
          onClick={() => setWeekOffset((prev) => prev + 1)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverDay("next");
          }}
          onDragLeave={() => setDragOverDay("")}
          onDrop={(e) => {
            e.preventDefault();
            const taskId = e.dataTransfer.getData("text/plain");
            setDragOverDay("");
            const nextWeekMonday = addDays(weekStart, 7);
            const nextWeekMondayISO = toISODate(nextWeekMonday);
            if (taskId) setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: nextWeekMondayISO } : t)));
            setWeekOffset((prev) => prev + 1);
          }}
        >
          <span className="navColumnText">Next Week</span>
        </div>
      </div>

      <TaskModal
        open={modalOpen}
        mode={modalMode}
        initialTask={modalMode === "edit" ? editingTask : null}
        onCancel={closeModal}
        onSave={handleSaveFromModal}
        onDelete={handleDelete}
        onUploadFile={handleUpload}
      />

      <BulkTaskModal open={bulkModalOpen} onCancel={() => setBulkModalOpen(false)} onExport={handleBulkExport} />

      <PrintTasksModal open={printModalOpen} onCancel={() => setPrintModalOpen(false)} tasks={tasks} formatDate={formatDisplayDate} />

      <SettingsModal open={settingsModalOpen} onCancel={() => setSettingsModalOpen(false)} />

      <ThemeSelector
        open={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        currentTheme={theme}
        onThemeChange={setTheme}
      />
    </div>
  );
}
