const API_URL = "/api/responses";
const POLL_INTERVAL_MS = 5000;

const statusText = document.getElementById("statusText");
const responsesContainer = document.getElementById("responses");

function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.rows)) {
    return payload.rows;
  }

  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

function renderRows(rows) {
  if (!responsesContainer) {
    return;
  }

  if (!rows.length) {
    responsesContainer.innerHTML = '<p class="empty">No responses yet.</p>';
    return;
  }

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const headerHtml = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = columns
        .map((col) => `<td>${escapeHtml(row?.[col] ?? "")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  responsesContainer.innerHTML = `
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  `;
}

async function fetchAndRender() {
  try {
    setStatus("Refreshing data...");

    const response = await fetch(`${API_URL}?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const rows = getRows(payload);
    renderRows(rows);
    const refreshedAt = payload.refreshedAt
      ? new Date(payload.refreshedAt).toLocaleTimeString()
      : new Date().toLocaleTimeString();
    setStatus(`Loaded ${rows.length} row(s). Last refresh: ${refreshedAt}`);
  } catch (error) {
    setStatus(`Failed to load data: ${error.message}`);
  }
}

fetchAndRender();
setInterval(fetchAndRender, POLL_INTERVAL_MS);
