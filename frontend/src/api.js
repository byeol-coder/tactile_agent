// Backend API client. In dev, Vite proxies /api to FastAPI (see vite.config.js).
const BASE = import.meta.env.VITE_API_BASE || "";

async function json(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  health: () => fetch(`${BASE}/api/health`).then(json),

  upload(file) {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/api/jobs`, { method: "POST", body: form }).then(json);
  },

  listJobs: () => fetch(`${BASE}/api/jobs`).then(json),

  getJob: (id) => fetch(`${BASE}/api/jobs/${id}`).then(json),

  updateSpec(id, spec) {
    return fetch(`${BASE}/api/jobs/${id}/spec`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec }),
    }).then(json);
  },

  artifactUrl: (id, name) => `${BASE}/api/jobs/${id}/export/${name}`,
  zipUrl: (id) => `${BASE}/api/jobs/${id}/export.zip`,
};
