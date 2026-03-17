const API_URLS = ["/api/responses", "http://localhost:3000/api/responses"];
const POLL_INTERVAL_MS = 5000;
const BASELINE_ZOOM = 1.43;
const GENRE_COLORS = {
  Pop: "#ff80a1",
  "K-pop": "#f0cfc7",
  Rock: "#ed321f",
  "Hip-hop / Rap": "#1db695",
  "R&B / Soul": "#967cc7",
  "Electronic / Dance": "#05bed6",
  Country: "#e69843",
  "Folk / Singer-Songwriter / Indie": "#8e663f",
  "Jazz / Blues": "#6698cc",
  Classical: "#e0f9fd",
  Reggae: "#3bcf57",
  Latin: "#fee58b",
  Metal: "#c0c6d0",
  Other: "#fcf9f0",
};
const GENDER_IMAGE_MAP = {
  woman: "images/woman.png",
  man: "images/men.png",
  nonbinary: "images/nonbin.png",
  other: "images/other.png",
  prefernottosay: "images/prefernot.png",
};
const URL_PARAMS = new URLSearchParams(window.location.search);
const USE_MOCK_DATA = URL_PARAMS.get("mock") === "1" || URL_PARAMS.get("fake") === "1";
const MOCK_DATA_COUNT = Math.min(
  40,
  Math.max(10, Number.parseInt(URL_PARAMS.get("mockCount") || "40", 10) || 40)
);
const MOCK_ARTISTS = [
  "Taylor Swift",
  "Drake",
  "The Weeknd",
  "Billie Eilish",
  "Bad Bunny",
  "SZA",
  "Lana Del Rey",
  "Arctic Monkeys",
  "Kendrick Lamar",
  "Travis Scott",
  "Doja Cat",
  "Frank Ocean",
  "Olivia Rodrigo",
  "Ariana Grande",
  "BTS",
  "NewJeans",
  "Tyler, The Creator",
  "Mac Miller",
  "Paramore",
  "Tame Impala",
  "Rihanna",
  "Radiohead",
  "Playboi Carti",
  "Laufey",
];

const statusText = document.getElementById("statusText");
const responsesContainer = document.getElementById("responses");
const legendContainer = document.querySelector(".genre-legend");
const legendToggle = document.getElementById("legendToggle");
const legendPanel = document.getElementById("legendPanel");
const legendToggleSymbol = document.getElementById("legendToggleSymbol");
const symbolContainer = document.querySelector(".symbol-legend");
const symbolToggle = document.getElementById("symbolToggle");
const symbolPanel = document.getElementById("symbolPanel");
const symbolToggleSymbol = document.getElementById("symbolToggleSymbol");
const zoomRange = document.getElementById("zoomRange");
const zoomValue = document.getElementById("zoomValue");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingLabel = document.getElementById("loadingLabel");
const loadingBarFill = document.getElementById("loadingBarFill");
let viewportState = null;
let panZoomController = null;
let hasLoadedOnce = false;
let loadingProgress = 0;
let loadingTimer = null;
let loadingStartMs = 0;
let expectedLoadMs = 9000;
let initialFetchInFlight = false;
let mockRowsCache = null;

function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

function renderLoadingProgress() {
  if (loadingBarFill) {
    loadingBarFill.style.width = `${loadingProgress}%`;
  }
}

function stopLoadingProgress() {
  if (loadingTimer) {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }
}

function startLoadingProgress() {
  if (loadingTimer) {
    return;
  }

  stopLoadingProgress();
  if (!loadingStartMs) {
    loadingStartMs = Date.now();
  }
  loadingProgress = Math.max(loadingProgress, 4);
  renderLoadingProgress();
  loadingTimer = setInterval(() => {
    const elapsed = Date.now() - loadingStartMs;
    const normalized = elapsed / expectedLoadMs;
    const eased = 1 - Math.exp(-3 * normalized);
    const target = Math.min(95, 95 * eased);
    loadingProgress = Math.max(loadingProgress, target);
    renderLoadingProgress();

    if (loadingProgress >= 95) {
      stopLoadingProgress();
    }
  }, 180);
}

function finishLoadingProgress() {
  stopLoadingProgress();
  loadingProgress = 100;
  renderLoadingProgress();
}

function setLoadingState(isLoading, message) {
  if (loadingLabel && message) {
    loadingLabel.textContent = message;
  }

  if (!loadingOverlay) {
    return;
  }

  if (isLoading) {
    loadingOverlay.classList.remove("is-hidden");
    return;
  }

  loadingOverlay.classList.toggle("is-hidden", !isLoading);
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

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getGenreColor(genre) {
  const normalizedGenre = normalizeKey(genre);
  const match = Object.entries(GENRE_COLORS).find(
    ([label]) => normalizeKey(label) === normalizedGenre
  );

  return match ? match[1] : "#94a3b8";
}

function getParticipantImage(gender) {
  const normalizedGender = normalizeKey(gender);
  return GENDER_IMAGE_MAP[normalizedGender] || GENDER_IMAGE_MAP.prefernottosay;
}

function hashText(text) {
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function getMockRows(totalRows) {
  if (mockRowsCache && mockRowsCache.length === totalRows) {
    return mockRowsCache;
  }

  const genreLabels = Object.keys(GENRE_COLORS);
  const genderLabels = ["Woman", "Man", "Non-binary", "Other", "Prefer not to say"];
  const rows = [];
  let artistIndex = 0;
  let cursor = 0;

  while (rows.length < totalRows) {
    const artist = MOCK_ARTISTS[artistIndex % MOCK_ARTISTS.length];
    const groupSize = Math.min(totalRows - rows.length, 2 + ((artistIndex * 5) % 9));

    for (let j = 0; j < groupSize; j += 1) {
      const genre = genreLabels[(artistIndex + j * 3 + cursor) % genreLabels.length];
      const gender = genderLabels[(artistIndex * 2 + j + cursor) % genderLabels.length];
      rows.push({
        "Top Artist #1": artist,
        "Most Listened Genre": genre,
        Gender: gender,
      });
      cursor += 1;
    }

    artistIndex += 1;
  }

  // Deterministic shuffle so same-artist clusters are distributed across the grid.
  const shuffled = rows.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const swapIndex = hashText(`mock-${i}`) % (i + 1);
    const temp = shuffled[i];
    shuffled[i] = shuffled[swapIndex];
    shuffled[swapIndex] = temp;
  }

  mockRowsCache = shuffled;
  return shuffled;
}

function seededNoise(seed, index) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createScribblePath(cx, cy, radius, seedText) {
  const steps = 40;
  const seed = hashText(seedText);
  let path = "";

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = t * Math.PI * 2;
    const jitter = (seededNoise(seed, i) - 0.5) * 0.95;
    const r = radius + jitter;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    path += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  return `${path} Z`;
}

function createScribbleConnectionPath(from, to, seedText) {
  const seed = hashText(seedText);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;

  if (length < 74) {
    const softBendA = (seededNoise(seed, 1) - 0.5) * 9;
    const softBendB = (seededNoise(seed, 2) - 0.5) * 7;
    const c1x = from.x + dx * 0.34 + nx * softBendA;
    const c1y = from.y + dy * 0.34 + ny * softBendA;
    const c2x = from.x + dx * 0.68 + nx * softBendB;
    const c2y = from.y + dy * 0.68 + ny * softBendB;
    return `M ${from.x} ${from.y} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${to.x} ${to.y}`;
  }

  const loopStrength = Math.min(Math.max(length * 0.18, 10), 30);
  const bendA = (seededNoise(seed, 1) - 0.5) * loopStrength * 2.2;
  const bendB = (seededNoise(seed, 2) - 0.5) * loopStrength * 2.2;
  const bendC = (seededNoise(seed, 3) - 0.5) * loopStrength * 2.2;
  const bendD = (seededNoise(seed, 4) - 0.5) * loopStrength * 2.2;

  const midX = from.x + dx * 0.5 + nx * ((seededNoise(seed, 5) - 0.5) * loopStrength * 1.1);
  const midY = from.y + dy * 0.5 + ny * ((seededNoise(seed, 6) - 0.5) * loopStrength * 1.1);

  const c1x = from.x + dx * 0.18 + nx * bendA;
  const c1y = from.y + dy * 0.18 + ny * bendA;
  const c2x = from.x + dx * 0.36 - nx * bendB;
  const c2y = from.y + dy * 0.36 - ny * bendB;

  const c3x = from.x + dx * 0.64 + nx * bendC;
  const c3y = from.y + dy * 0.64 + ny * bendC;
  const c4x = from.x + dx * 0.82 - nx * bendD;
  const c4y = from.y + dy * 0.82 - ny * bendD;

  return `M ${from.x} ${from.y} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${midX.toFixed(2)} ${midY.toFixed(2)} C ${c3x.toFixed(2)} ${c3y.toFixed(2)}, ${c4x.toFixed(2)} ${c4y.toFixed(2)}, ${to.x} ${to.y}`;
}

function syncGuideButtonVisibility() {
  const isLegendOpen = Boolean(legendContainer?.classList.contains("is-open"));
  const isSymbolOpen = Boolean(symbolContainer?.classList.contains("is-open"));

  document.body.classList.toggle("legend-open", isLegendOpen);
  document.body.classList.toggle("symbol-open", isSymbolOpen);

  if (symbolToggle) {
    symbolToggle.hidden = isLegendOpen;
    symbolToggle.style.display = isLegendOpen ? "none" : "flex";
  }

  if (legendToggle) {
    legendToggle.hidden = isSymbolOpen;
    legendToggle.style.display = isSymbolOpen ? "none" : "flex";
  }
}

function closeSymbolGuide() {
  if (!symbolContainer) return;
  symbolContainer.classList.remove("is-open");
  if (symbolToggle) symbolToggle.setAttribute("aria-expanded", "false");
  if (symbolPanel) symbolPanel.setAttribute("aria-hidden", "true");
  if (symbolToggleSymbol) symbolToggleSymbol.textContent = "<";
  syncGuideButtonVisibility();
}

function closeLegend() {
  if (!legendContainer) return;
  legendContainer.classList.remove("is-open");
  if (legendToggle) legendToggle.setAttribute("aria-expanded", "false");
  if (legendPanel) legendPanel.setAttribute("aria-hidden", "true");
  if (legendToggleSymbol) legendToggleSymbol.textContent = "<";
  syncGuideButtonVisibility();
}

function toggleLegend() {
  if (!legendContainer || !legendToggle || !legendPanel) {
    return;
  }

  const isOpen = legendContainer.classList.toggle("is-open");
  legendToggle.setAttribute("aria-expanded", String(isOpen));
  legendPanel.setAttribute("aria-hidden", String(!isOpen));
  if (legendToggleSymbol) {
    legendToggleSymbol.textContent = isOpen ? "x" : "<";
  }
  if (isOpen) closeSymbolGuide();
  syncGuideButtonVisibility();
}

function toggleSymbolGuide() {
  if (!symbolContainer || !symbolToggle || !symbolPanel) {
    return;
  }

  const isOpen = symbolContainer.classList.toggle("is-open");
  symbolToggle.setAttribute("aria-expanded", String(isOpen));
  symbolPanel.setAttribute("aria-hidden", String(!isOpen));
  if (symbolToggleSymbol) {
    symbolToggleSymbol.textContent = isOpen ? "x" : "<";
  }
  if (isOpen) closeLegend();
  syncGuideButtonVisibility();
}

if (legendToggle) {
  legendToggle.addEventListener("click", toggleLegend);
}

if (symbolToggle) {
  symbolToggle.addEventListener("click", toggleSymbolGuide);
}

syncGuideButtonVisibility();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toSvgPoint(svg, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();

  if (!matrix) {
    return { x: 0, y: 0 };
  }

  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function applyViewBox(svg, state) {
  svg.setAttribute("viewBox", `${state.x} ${state.y} ${state.w} ${state.h}`);
}

function getZoomPercent() {
  if (!viewportState || !panZoomController) {
    return 100;
  }

  const percent = (panZoomController.baselineWidth / viewportState.w) * 100;
  return Math.round(percent);
}

function syncZoomUi() {
  const percent = getZoomPercent();

  if (zoomRange) {
    zoomRange.value = String(clamp(percent, Number(zoomRange.min), Number(zoomRange.max)));
  }

  if (zoomValue) {
    zoomValue.textContent = `${percent}%`;
  }
}

function ensureViewportState(contentWidth, contentHeight) {
  const baselineWidth = contentWidth / BASELINE_ZOOM;
  const baselineHeight = contentHeight / BASELINE_ZOOM;

  if (!viewportState) {
    viewportState = {
      x: (contentWidth - baselineWidth) / 2,
      y: (contentHeight - baselineHeight) / 2,
      w: baselineWidth,
      h: baselineHeight,
      minW: baselineWidth / 5,
      maxW: contentWidth,
    };
    return;
  }

  viewportState.minW = baselineWidth / 5;
  viewportState.maxW = contentWidth;
  viewportState.w = clamp(viewportState.w, viewportState.minW, viewportState.maxW);
  const aspect = contentHeight / contentWidth;
  viewportState.h = viewportState.w * aspect;
}

function attachPanZoom(svg, contentWidth, contentHeight) {
  ensureViewportState(contentWidth, contentHeight);

  let isDragging = false;
  let dragStart = null;
  const baseAspect = contentHeight / contentWidth;
  const baselineWidth = contentWidth / BASELINE_ZOOM;
  const baselineHeight = contentHeight / BASELINE_ZOOM;
  const fitPercent = Math.round((baselineWidth / contentWidth) * 100);
  svg.classList.add("is-panzoom");

  if (zoomRange) {
    zoomRange.min = String(fitPercent);
  }

  applyViewBox(svg, viewportState);

  function zoomAt(clientX, clientY, scaleFactor) {
    const cursor = toSvgPoint(svg, clientX, clientY);
    const nextW = clamp(viewportState.w * scaleFactor, viewportState.minW, viewportState.maxW);
    const nextH = nextW * baseAspect;

    const rx = viewportState.w ? (cursor.x - viewportState.x) / viewportState.w : 0.5;
    const ry = viewportState.h ? (cursor.y - viewportState.y) / viewportState.h : 0.5;

    viewportState.x = cursor.x - rx * nextW;
    viewportState.y = cursor.y - ry * nextH;
    viewportState.w = nextW;
    viewportState.h = nextH;
    applyViewBox(svg, viewportState);
    syncZoomUi();
  }

  function zoomFromCenter(scaleFactor) {
    const rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, scaleFactor);
  }

  function resetView() {
    viewportState.x = (contentWidth - baselineWidth) / 2;
    viewportState.y = (contentHeight - baselineHeight) / 2;
    viewportState.w = baselineWidth;
    viewportState.h = baselineHeight;
    applyViewBox(svg, viewportState);
    syncZoomUi();
  }

  function onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    isDragging = true;
    svg.classList.add("is-dragging");
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      viewX: viewportState.x,
      viewY: viewportState.y,
      viewW: viewportState.w,
      viewH: viewportState.h,
    };
    svg.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!isDragging || !dragStart) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    viewportState.x = dragStart.viewX - (dx * dragStart.viewW) / rect.width;
    viewportState.y = dragStart.viewY - (dy * dragStart.viewH) / rect.height;
    applyViewBox(svg, viewportState);
  }

  function onPointerUp(event) {
    isDragging = false;
    dragStart = null;
    svg.classList.remove("is-dragging");
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const scaleFactor = Math.exp(event.deltaY * 0.0012);
    zoomAt(event.clientX, event.clientY, scaleFactor);
  }

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);
  svg.addEventListener("wheel", onWheel, { passive: false });

  panZoomController = {
    contentWidth,
    contentHeight,
    baselineWidth,
    zoomIn() {
      zoomFromCenter(0.88);
    },
    zoomOut() {
      zoomFromCenter(1.14);
    },
    reset() {
      resetView();
    },
    setZoomPercent(percent) {
      const nextW = clamp(baselineWidth / (percent / 100), viewportState.minW, viewportState.maxW);
      const rect = svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const scaleFactor = nextW / viewportState.w;
      zoomAt(centerX, centerY, scaleFactor);
    },
  };

  syncZoomUi();
}

function attachRevealInteractions() {
  const pointGroups = Array.from(document.querySelectorAll(".point-group"));

  if (!pointGroups.length) {
    return;
  }

  const linkGroups = Array.from(document.querySelectorAll(".link-group"));

  function setRevealState(artistKey, shouldReveal) {
    pointGroups.forEach((group) => {
      if (group.dataset.artistKey === artistKey) {
        group.classList.toggle("is-revealed", shouldReveal);
      }
    });
    linkGroups.forEach((link) => {
      if (link.dataset.artistKey === artistKey) {
        link.classList.toggle("is-revealed", shouldReveal);
      }
    });
  }

  pointGroups.forEach((group) => {
    const artistKey = group.dataset.artistKey;
    if (!artistKey) {
      return;
    }

    group.addEventListener("pointerenter", () => {
      setRevealState(artistKey, true);
    });

    group.addEventListener("pointerleave", () => {
      setRevealState(artistKey, false);
    });
  });
}

if (zoomRange) {
  zoomRange.addEventListener("input", (event) => {
    if (panZoomController) {
      panZoomController.setZoomPercent(Number(event.target.value));
    }
  });
}

if (zoomResetBtn) {
  zoomResetBtn.addEventListener("click", () => {
    if (panZoomController) {
      panZoomController.reset();
    }
  });
}

function renderRows(rows) {
  if (!responsesContainer) {
    return;
  }

  const entries = rows
    .map((row) => ({
      artist: String(row?.["Top Artist #1"] ?? row?.artist1 ?? "").trim(),
      genre: String(row?.["Most Listened Genre"] ?? row?.genre ?? "Other").trim(),
      gender: String(row?.Gender ?? row?.gender ?? "Prefer not to say").trim(),
    }))
    .filter((entry) => entry.artist);

  if (!entries.length) {
    responsesContainer.innerHTML = '<p class="empty">No Top Artist #1 data yet.</p>';
    return;
  }

  const markerRadius = 15.2;
  const padding = 56;
  const baseSpan = Math.max(560, Math.sqrt(entries.length) * 66);
  const dataWidth = padding * 2 + baseSpan * 1.16;
  const dataHeight = padding * 2 + baseSpan * 0.94;
  const width = Math.max(Math.round(dataWidth), window.innerWidth);
  const height = Math.max(Math.round(dataHeight), window.innerHeight);
  const minGap = markerRadius * 2 + 4;
  const minGapSq = minGap * minGap;
  const placed = [];

  const points = entries.map((entry, index) => {
    const seed = hashText(`${entry.artist}|${entry.genre}|${entry.gender}|${index}`);
    let bestX = padding + seededNoise(seed, 1) * (width - padding * 2);
    let bestY = padding + seededNoise(seed, 2) * (height - padding * 2);
    let bestScore = -1;

    for (let attempt = 0; attempt < 110; attempt += 1) {
      const nx = seededNoise(seed, attempt * 2 + 1);
      const ny = seededNoise(seed, attempt * 2 + 2);
      const candidateX = padding + nx * (width - padding * 2);
      const candidateY = padding + ny * (height - padding * 2);

      let nearestSq = Infinity;
      for (let i = 0; i < placed.length; i += 1) {
        const px = placed[i].x;
        const py = placed[i].y;
        const ddx = candidateX - px;
        const ddy = candidateY - py;
        const distSq = ddx * ddx + ddy * ddy;
        if (distSq < nearestSq) {
          nearestSq = distSq;
        }
      }

      const score = placed.length ? nearestSq : minGapSq;
      if (score > bestScore) {
        bestScore = score;
        bestX = candidateX;
        bestY = candidateY;
      }

      if (score >= minGapSq) {
        break;
      }
    }

    const point = {
      artist: entry.artist,
      genre: entry.genre || "Other",
      gender: entry.gender || "Prefer not to say",
      imageSrc: getParticipantImage(entry.gender),
      normalizedArtist: entry.artist.toLowerCase(),
      x: bestX,
      y: bestY,
    };

    placed.push(point);
    return point;
  });

  const groupedByArtist = points.reduce((map, point) => {
    const existing = map.get(point.normalizedArtist) || [];
    existing.push(point);
    map.set(point.normalizedArtist, existing);
    return map;
  }, new Map());

  const linesHtml = Array.from(groupedByArtist.values())
    .filter((group) => group.length > 1)
    .map((group) => {
      let segments = "";
      const artistName = escapeHtml(group[0].artist);

      for (let i = 1; i < group.length; i += 1) {
        const from = group[i - 1];
        const to = group[i];
        const d = createScribbleConnectionPath(from, to, `${artistName}|${i}`);
        segments += `
          <g class="link-group" data-artist-key="${escapeHtml(group[0].normalizedArtist)}">
            <path d="${d}" class="link-line-scribble" aria-hidden="true"></path>
            <path d="${d}" class="link-hit">
              <title>Top Artist #1: ${artistName}</title>
            </path>
          </g>
        `;
      }

      return segments;
    })
    .join("");

  const defsHtml = points
    .map(
      (point, index) => `
      <clipPath id="avatar-clip-${index}">
        <circle cx="${point.x}" cy="${point.y}" r="7.5" />
      </clipPath>
    `
    )
    .join("");

  const pointsHtml = points
    .map(
      (point, index) => {
        const ringColor = getGenreColor(point.genre);
        return `
      <g class="point-group" data-artist-key="${escapeHtml(point.normalizedArtist)}" style="--genre-color: ${ringColor};">
        <path
          class="genre-scribble"
          d="${createScribblePath(point.x, point.y, 15.2, `${point.artist}|${point.genre}|${index}`)}"
          style="fill: #02121b;"
        ></path>
        <image
          class="participant-image"
          href="${escapeHtml(point.imageSrc)}"
          x="${(point.x - 7.5).toFixed(2)}"
          y="${(point.y - 7.5).toFixed(2)}"
          width="15"
          height="15"
          preserveAspectRatio="xMidYMid slice"
          clip-path="url(#avatar-clip-${index})"
        ></image>
        <circle class="point-hit" cx="${point.x}" cy="${point.y}" r="12.4">
          <title>Top Artist #1: ${escapeHtml(point.artist)} | Genre: ${escapeHtml(point.genre)} | Gender: ${escapeHtml(point.gender)}</title>
        </circle>
      </g>
    `;
      }
    )
    .join("");

  responsesContainer.innerHTML = `
    <div class="plot" aria-label="Top Artist #1 data points">
      <svg id="plotSvg" class="plot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Top Artist #1 data circles with duplicate connections">
        <defs>
          ${defsHtml}
        </defs>
        ${linesHtml}
        ${pointsHtml}
      </svg>
    </div>
  `;

  const plotSvg = document.getElementById("plotSvg");
  if (plotSvg) {
    attachPanZoom(plotSvg, width, height);
  }

  attachRevealInteractions();
}

async function fetchAndRender() {
  if (!hasLoadedOnce && initialFetchInFlight) {
    return;
  }

  const requestStartMs = Date.now();
  if (!hasLoadedOnce) {
    initialFetchInFlight = true;
  }

  let lastError = null;

  if (!hasLoadedOnce) {
    setLoadingState(true, "Your connections await");
    startLoadingProgress();
  }

  if (USE_MOCK_DATA) {
    const rows = getMockRows(MOCK_DATA_COUNT);
    renderRows(rows);
    hasLoadedOnce = true;
    finishLoadingProgress();
    setTimeout(() => {
      setLoadingState(false);
    }, 180);
    loadingStartMs = 0;
    initialFetchInFlight = false;
    setStatus(`Loaded ${rows.length} row(s). Mock mode is ON.`);
    return;
  }

  for (const baseUrl of API_URLS) {
    try {
      setStatus("Refreshing data...");

      const response = await fetch(`${baseUrl}?t=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const rows = getRows(payload);
      renderRows(rows);
      hasLoadedOnce = true;
      const elapsed = Date.now() - requestStartMs;
      expectedLoadMs = Math.round(expectedLoadMs * 0.7 + elapsed * 0.3);
      finishLoadingProgress();
      setTimeout(() => {
        setLoadingState(false);
      }, 180);
      loadingStartMs = 0;
      initialFetchInFlight = false;
      const refreshedAt = payload.refreshedAt
        ? new Date(payload.refreshedAt).toLocaleTimeString()
        : new Date().toLocaleTimeString();
      setStatus(`Loaded ${rows.length} row(s). Last refresh: ${refreshedAt}`);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  responsesContainer.innerHTML = '<p class="empty">Unable to load Top Artist #1 data.</p>';
  if (lastError) {
    setStatus(`Failed to load data: ${lastError.message}`);
    setLoadingState(true, "Still reaching for your connections...");
    stopLoadingProgress();
    loadingProgress = Math.max(loadingProgress, 96);
    renderLoadingProgress();
  }

  if (!hasLoadedOnce) {
    initialFetchInFlight = false;
  }
}

fetchAndRender();
setInterval(fetchAndRender, POLL_INTERVAL_MS);
