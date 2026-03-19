const API_URLS = ["/api/responses", "http://localhost:3000/api/responses"];
const POLL_INTERVAL_MS = 5000;
const BASELINE_ZOOM = 1.43;
const GENRE_COLORS = {
  Pop: "#ff6f91",
  "K-pop": "#f7b8a8",
  Rock: "#ff3b2f",
  "Hip-hop / Rap": "#20c997",
  "R&B / Soul": "#8b6ee8",
  "Electronic / Dance": "#00cfe8",
  Country: "#f4a261",
  "Folk / Singer-Songwriter / Indie": "#a47148",
  "Jazz / Blues": "#5fa8ff",
  Classical: "#9bdaf1",
  Reggae: "#2ddf6e",
  Latin: "#ffe066",
  Metal: "#aeb6c1",
  Other: "#ffffff",
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
  100,
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
const infoContainer = document.querySelector(".info-legend");
const infoToggle = document.getElementById("infoToggle");
const infoPanel = document.getElementById("infoPanel");
const infoToggleSymbol = document.getElementById("infoToggleSymbol");
const infoClose = document.getElementById("infoClose");
const entryBtn = document.getElementById("entryBtn");
const entryPanel = document.getElementById("entryPanel");
const entryClose = document.getElementById("entryClose");
const entryToggleSymbol = document.getElementById("entryToggleSymbol");
const entryFrame = document.getElementById("entryFrame");
const entryFrameInitialSrc = entryFrame?.getAttribute("src") || "";
const entryReturnPrompt = document.getElementById("entryReturnPrompt");
const entryReturnCloseBtn = document.getElementById("entryReturnCloseBtn");
const zoomRange = document.getElementById("zoomRange");
const zoomValue = document.getElementById("zoomValue");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingLabel = document.getElementById("loadingLabel");
const loadingBarFill = document.getElementById("loadingBarFill");
const pageBody = document.body;
let viewportState = null;
let panZoomController = null;
let hasLoadedOnce = false;
let loadingProgress = 0;
let loadingTimer = null;
let loadingStartMs = 0;
let expectedLoadMs = 9000;
let initialFetchInFlight = false;
let mockRowsCache = null;
let pointTooltipEl = null;
let lineTooltipEl = null;
let interactionsAbortController = null;
const INITIAL_TITLE_CLEARANCE = 110;
const FIRST_ROW_EXTRA_GAP = 12;
const SVG_CACHE = {};
let introGateActive = Boolean(infoPanel && infoClose);
let entryNeedsReturnPrompt = false;

function hideEntryReturnPrompt() {
  if (!entryReturnPrompt) {
    return;
  }

  entryReturnPrompt.classList.remove("is-open");
  entryReturnPrompt.setAttribute("aria-hidden", "true");
}

function showEntryReturnPrompt() {
  if (!entryReturnPrompt) {
    return;
  }

  entryReturnPrompt.classList.add("is-open");
  entryReturnPrompt.setAttribute("aria-hidden", "false");
}

function remindDiscoverButton() {
  if (!infoClose) {
    return;
  }

  infoClose.classList.remove("is-reminder");
  // Force reflow so the shake animation can restart on repeated reminders.
  void infoClose.offsetWidth;
  infoClose.classList.add("is-reminder");
}

if (infoClose) {
  infoClose.addEventListener("animationend", (event) => {
    if (event.animationName === "discover-reminder-shake") {
      infoClose.classList.remove("is-reminder");
    }
  });
}

if (introGateActive && pageBody) {
  pageBody.classList.add("intro-locked");
}

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

function getInitialTopSafeInset() {
  const heading = document.querySelector(".hero-copy");
  if (!heading) {
    return 0;
  }

  // Use offset metrics so transform animations do not shift layout on later poll re-renders.
  const top = Number.isFinite(heading.offsetTop) ? heading.offsetTop : 0;
  const height = Number.isFinite(heading.offsetHeight) ? heading.offsetHeight : 0;

  if (height > 0) {
    return Math.max(0, Math.ceil(top + height + INITIAL_TITLE_CLEARANCE));
  }

  const rect = heading.getBoundingClientRect();
  return Math.max(0, Math.ceil(rect.bottom + INITIAL_TITLE_CLEARANCE));
}

function getSvgInlineElement(imageSrc, gender) {
  // Map normalized gender to SVG content directly
  const normalizedGender = normalizeKey(gender);
  
  const svgMap = {
    woman: '<circle cx="200" cy="97.69231" r="87.69231" fill="currentColor" stroke-width="0"/><circle cx="97.69231" cy="200" r="87.69231" fill="currentColor" stroke-width="0"/><circle cx="200" cy="302.30769" r="87.69231" fill="currentColor" stroke-width="0"/><circle cx="302.30769" cy="200" r="87.69231" fill="currentColor" stroke-width="0"/><circle cx="200" cy="200" r="47.8186" fill="currentColor" stroke-width="0"/>',
    man: '<circle cx="200" cy="200" r="180" fill="currentColor" stroke-width="0"/>',
    nonbinary: '<path d="m208.17287,23.93301l51.65263,104.65967c1.32757,2.68994,3.89376,4.55439,6.86229,4.98575l115.4988,16.78296c7.47551,1.08625,10.46044,10.27294,5.05111,15.54573l-83.57572,81.46619c-2.14805,2.09383-3.12825,5.11057-2.62116,8.06711l19.72955,115.03211c1.27697,7.4453-6.53769,13.12298-13.22399,9.60779l-103.30527-54.31079c-2.65513-1.39589-5.82713-1.39589-8.48226,0l-103.30527,54.31079c-6.6863,3.51519-14.50096-2.16249-13.22399-9.60779l19.72955-115.03211c.50709-2.95654-.47311-5.97328-2.62116-8.06711L12.76229,165.90711c-5.40933-5.27279-2.42439-14.45947,5.05111-15.54573l115.4988-16.78296c2.96853-.43135,5.53473-2.2958,6.86229-4.98575l51.65263-104.65967c3.34315-6.77396,13.0026-6.77396,16.34575,0Z" fill="currentColor" stroke-width="0"/>',
    other: '<path d="m358.52059,181.6907c-28.56388-94.11691-130.83491-140.07861-223.25923-106.43884-73.93946,26.91182-112.06289,108.66793-85.15107,182.60738,21.52945,59.15156,96.93434,92.65031,156.08591,71.12086,47.32125-17.22356,81.72025-72.54747,64.49668-119.86873-13.77885-37.857-55.63798-57.3762-93.49498-43.59735-30.2856,11.02308-40.90096,44.51038-29.87788,74.79598" fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="65"/>',
    prefernottosay: '<line x1="75" y1="75" x2="325" y2="325" fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="80"/><line x1="325" y1="75" x2="75" y2="325" fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="80"/>',
  };

  const svgContent = svgMap[normalizedGender] || svgMap.woman;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 400 400" class="participant-image-svg" aria-hidden="true">${svgContent}</svg>`;
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

function getCubicPoint(from, c1, c2, to, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const x =
    mt2 * mt * from.x +
    3 * mt2 * t * c1.x +
    3 * mt * t2 * c2.x +
    t2 * t * to.x;
  const y =
    mt2 * mt * from.y +
    3 * mt2 * t * c1.y +
    3 * mt * t2 * c2.y +
    t2 * t * to.y;
  return { x, y };
}

function getCurveCrowdingPenalty(from, c1, c2, to, points) {
  const sampleCount = 14;
  const avoidRadius = 16;
  let penalty = 0;

  for (let i = 1; i < sampleCount; i += 1) {
    const sample = getCubicPoint(from, c1, c2, to, i / sampleCount);
    for (let j = 0; j < points.length; j += 1) {
      const p = points[j];
      if (p === from || p === to) {
        continue;
      }

      const distance = Math.hypot(sample.x - p.x, sample.y - p.y);
      if (distance < avoidRadius) {
        const overlap = avoidRadius - distance;
        penalty += overlap * overlap;
      }
    }
  }

  return penalty;
}

function getTwoSegmentCurveCrowdingPenalty(from, c1, c2, mid, c3, c4, to, points) {
  const firstSegmentPenalty = getCurveCrowdingPenalty(from, c1, c2, mid, points);
  const secondSegmentPenalty = getCurveCrowdingPenalty(mid, c3, c4, to, points);
  return firstSegmentPenalty + secondSegmentPenalty;
}

function createScribbleConnectionPath(from, to, points, seedText) {
  const seed = hashText(seedText);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const tx = dx / length;
  const ty = dy / length;
  const nx = -dy / length;
  const ny = dx / length;

  const baseBend = Math.min(Math.max(length * 0.26, 10), 64);
  const alongDrift = (seededNoise(seed, 7) - 0.5) * 16;
  const bendScales = [0.9, 1.1, 1.3, 1.5];

  let bestCurve = null;

  for (let i = 0; i < bendScales.length; i += 1) {
    const bend = baseBend * bendScales[i];
    for (let directionIndex = 0; directionIndex < 2; directionIndex += 1) {
      const direction = directionIndex === 0 ? 1 : -1;
      const leadOffset = bend * direction;
      const trailOffset = bend * -direction * 0.92;
      const midOffset = bend * direction * 0.22;

      const mid = {
        x: from.x + dx * 0.5 + nx * midOffset,
        y: from.y + dy * 0.5 + ny * midOffset,
      };

    const c1 = {
      x: from.x + dx * 0.2 + nx * leadOffset + tx * alongDrift,
      y: from.y + dy * 0.2 + ny * leadOffset + ty * alongDrift,
    };
    const c2 = {
      x: from.x + dx * 0.42 + nx * (leadOffset * 0.55),
      y: from.y + dy * 0.42 + ny * (leadOffset * 0.55),
    };

    // Mirror c2 around the midpoint so the tangent is continuous at the join.
    const c3 = {
      x: mid.x + (mid.x - c2.x) * 0.96,
      y: mid.y + (mid.y - c2.y) * 0.96,
    };
    const c4 = {
      x: from.x + dx * 0.8 + nx * trailOffset - tx * alongDrift,
      y: from.y + dy * 0.8 + ny * trailOffset - ty * alongDrift,
    };

    // Prefer routes that stay away from unrelated points while keeping squiggles smooth.
    const crowdPenalty = getTwoSegmentCurveCrowdingPenalty(from, c1, c2, mid, c3, c4, to, points);
    const smoothPenalty = Math.abs(leadOffset) * 0.1;
    const score = crowdPenalty + smoothPenalty;

    if (!bestCurve || score < bestCurve.score) {
      bestCurve = { c1, c2, mid, c3, c4, score };
    }
    }
  }

  const c1 = bestCurve ? bestCurve.c1 : { x: from.x + dx * 0.25, y: from.y + dy * 0.25 };
  const c2 = bestCurve ? bestCurve.c2 : { x: from.x + dx * 0.42, y: from.y + dy * 0.42 };
  const mid = bestCurve
    ? bestCurve.mid
    : { x: from.x + dx * 0.5 + nx * 8, y: from.y + dy * 0.5 + ny * 8 };
  const c3 = bestCurve ? bestCurve.c3 : { x: from.x + dx * 0.58, y: from.y + dy * 0.58 };
  const c4 = bestCurve ? bestCurve.c4 : { x: from.x + dx * 0.75, y: from.y + dy * 0.75 };

  return `M ${from.x} ${from.y} C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${mid.x.toFixed(2)} ${mid.y.toFixed(2)} C ${c3.x.toFixed(2)} ${c3.y.toFixed(2)}, ${c4.x.toFixed(2)} ${c4.y.toFixed(2)}, ${to.x} ${to.y}`;
}

function orderGroupPointsForFlow(group, seedText) {
  if (group.length <= 2) {
    return group.slice();
  }

  const remaining = group.slice();
  const seed = hashText(seedText);
  let startIndex = 0;
  let startScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < remaining.length; i += 1) {
    const p = remaining[i];
    const score = p.x * 0.7 + p.y * 0.3 + seededNoise(seed, i) * 1.5;
    if (score < startScore) {
      startScore = score;
      startIndex = i;
    }
  }

  const ordered = [remaining.splice(startIndex, 1)[0]];

  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const distance = Math.hypot(candidate.x - last.x, candidate.y - last.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }

  return ordered;
}

function ensurePointTooltip() {
  if (pointTooltipEl) {
    return pointTooltipEl;
  }

  pointTooltipEl = document.createElement("div");
  pointTooltipEl.className = "point-tooltip is-hidden";
  document.body.appendChild(pointTooltipEl);
  return pointTooltipEl;
}

function ensureLineTooltip() {
  if (lineTooltipEl) {
    return lineTooltipEl;
  }

  lineTooltipEl = document.createElement("div");
  lineTooltipEl.className = "line-hover-tooltip is-hidden";
  document.body.appendChild(lineTooltipEl);
  return lineTooltipEl;
}

function positionPointTooltip(clientX, clientY) {
  const tooltip = ensurePointTooltip();
  const pad = 12;
  const offset = 16;
  let x = clientX + offset;
  let y = clientY - offset;

  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - pad) {
    x = clientX - rect.width - offset;
  }
  if (y + rect.height > window.innerHeight - pad) {
    y = window.innerHeight - rect.height - pad;
  }
  if (y < pad) {
    y = pad;
  }
  if (x < pad) {
    x = pad;
  }

  tooltip.style.left = `${Math.round(x)}px`;
  tooltip.style.top = `${Math.round(y)}px`;
}

function positionLineTooltip(clientX, clientY) {
  const tooltip = ensureLineTooltip();
  const pad = 10;
  const offset = 14;
  let x = clientX + offset;
  let y = clientY - offset;

  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - pad) {
    x = clientX - rect.width - offset;
  }
  if (y + rect.height > window.innerHeight - pad) {
    y = window.innerHeight - rect.height - pad;
  }
  if (y < pad) {
    y = pad;
  }
  if (x < pad) {
    x = pad;
  }

  tooltip.style.left = `${Math.round(x)}px`;
  tooltip.style.top = `${Math.round(y)}px`;
}

function showLineTooltip(artistName, event) {
  const tooltip = ensureLineTooltip();
  tooltip.textContent = `Connected by: ${artistName || "Unknown artist"}`;
  tooltip.classList.remove("is-hidden");
  positionLineTooltip(event.clientX, event.clientY);
}

function hideLineTooltip() {
  if (!lineTooltipEl) {
    return;
  }
  lineTooltipEl.classList.add("is-hidden");
}

function resolveTooltipImageUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  const deEntityValue = value.replaceAll("&amp;", "&");

  const quotedUrlMatch = deEntityValue.match(/"(https?:\/\/[^"\s]+)"/i);
  if (quotedUrlMatch) {
    return quotedUrlMatch[1];
  }

  const anyUrlMatch = deEntityValue.match(/https?:\/\/[^\s)"']+/i);
  if (anyUrlMatch) {
    return anyUrlMatch[0];
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  if (/^[a-z0-9.-]+\/[a-z0-9/_-]+$/i.test(value) && !value.startsWith("data:")) {
    return `https://${value}`;
  }

  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }

  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length) {
        const first = parsed[0];
        if (typeof first === "string") {
          return first;
        }
        if (first && typeof first.url === "string") {
          return first.url;
        }
      }
      if (parsed && typeof parsed.url === "string") {
        return parsed.url;
      }
    } catch {
      return "";
    }
  }

  return "";
}

function pickLooseRowValue(row, predicate) {
  const entries = Object.entries(row || {});
  for (let i = 0; i < entries.length; i += 1) {
    const [key, raw] = entries[i];
    if (predicate(normalizeKey(key)) && String(raw || "").trim()) {
      return String(raw).trim();
    }
  }
  return "";
}

function showPointTooltip(pointData, event) {
  const tooltip = ensurePointTooltip();
  const displayName = pointData.displayName || "Anonymous";
  const artist1Name = pointData.topArtist1SpotifyName || pointData.artist || "Unknown artist";
  const artist2 = pointData.topArtist2 || "-";
  const artist3 = pointData.topArtist3 || "-";
  const ageRange = pointData.ageRange || "-";
  const region = pointData.region || "-";
  const imageUrl =
    resolveTooltipImageUrl(pointData.topArtist1ImageUrl) ||
    resolveTooltipImageUrl(pointData.fallbackImageUrl);

  tooltip.innerHTML = `
    <button class="point-tooltip-close" type="button" aria-label="Close">X</button>
    <div class="point-tooltip-name">${escapeHtml(displayName)}</div>
    <div class="point-tooltip-image-wrap">
      ${
        imageUrl
          ? `<img class="point-tooltip-image" src="${escapeHtml(imageUrl)}" alt="Top artist image" />`
          : `<div class="point-tooltip-image point-tooltip-image-empty">No image</div>`
      }
    </div>
    <div class="point-tooltip-top-artists-list">
      <div class="point-tooltip-meta"><span>Top Artists</span><strong>${escapeHtml(artist1Name)}</strong></div>
      <div class="point-tooltip-top-artist-item">${escapeHtml(artist2)}</div>
      <div class="point-tooltip-top-artist-item">${escapeHtml(artist3)}</div>
    </div>
    <div class="point-tooltip-demographics-list point-tooltip-location-row">
      <div class="point-tooltip-meta"><span>Age Range</span><strong>${escapeHtml(ageRange)}</strong></div>
      <div class="point-tooltip-meta"><span>Region</span><strong>${escapeHtml(region)}</strong></div>
    </div>
  `;
  tooltip.classList.remove("is-hidden");
  positionPointTooltip(event.clientX, event.clientY);
}

function hidePointTooltip() {
  if (!pointTooltipEl) {
    return;
  }
  pointTooltipEl.classList.add("is-hidden");
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

function closeInfoGuide(options = {}) {
  const { force = false } = options;

  if (introGateActive && !force) {
    return;
  }

  if (!infoPanel) return;
  infoPanel.classList.remove("is-open");
  if (infoToggle) infoToggle.setAttribute("aria-expanded", "false");
  if (infoPanel) infoPanel.setAttribute("aria-hidden", "true");
  if (infoToggleSymbol) infoToggleSymbol.textContent = ">";
}

function closeEntryPanel() {
  if (!entryPanel) {
    return;
  }

  hideEntryReturnPrompt();
  entryNeedsReturnPrompt = false;

  entryPanel.classList.remove("is-open");
  entryPanel.setAttribute("aria-hidden", "true");

  if (entryBtn) {
    entryBtn.setAttribute("aria-expanded", "false");
  }

  if (entryToggleSymbol) {
    entryToggleSymbol.textContent = ">";
  }

  if (entryFrame && entryFrameInitialSrc) {
    entryFrame.setAttribute("src", "about:blank");
  }
}

function openEntryPanel() {
  if (!entryPanel || !entryBtn) {
    return;
  }

  if (introGateActive) {
    remindDiscoverButton();
    return;
  }

  if (entryFrame && entryFrameInitialSrc) {
    entryFrame.setAttribute("src", entryFrameInitialSrc);
  }

  closeInfoGuide({ force: true });
  hideEntryReturnPrompt();
  entryNeedsReturnPrompt = false;
  entryPanel.classList.add("is-open");
  entryPanel.setAttribute("aria-hidden", "false");
  entryBtn.setAttribute("aria-expanded", "true");
  if (entryToggleSymbol) {
    entryToggleSymbol.textContent = "X";
  }
}

function completeIntroGate() {
  introGateActive = false;
  if (pageBody) {
    pageBody.classList.remove("intro-locked");
    pageBody.classList.add("intro-complete");
  }
}

function toggleLegend() {
  if (!legendContainer || !legendToggle || !legendPanel) {
    return;
  }

  const isOpen = legendContainer.classList.toggle("is-open");
  legendToggle.setAttribute("aria-expanded", String(isOpen));
  legendPanel.setAttribute("aria-hidden", String(!isOpen));
  if (legendToggleSymbol) {
    legendToggleSymbol.textContent = isOpen ? "X" : "<";
  }
  if (isOpen) {
    closeSymbolGuide();
    closeInfoGuide();
  }
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
    symbolToggleSymbol.textContent = isOpen ? "X" : "<";
  }
  if (isOpen) {
    closeLegend();
    closeInfoGuide();
  }
  syncGuideButtonVisibility();
}

function toggleInfoGuide() {
  if (!infoToggle || !infoPanel) {
    return;
  }

  const isOpen = !infoPanel.classList.contains("is-open");

  if (!isOpen && introGateActive) {
    return;
  }

  infoPanel.classList.toggle("is-open", isOpen);
  infoToggle.setAttribute("aria-expanded", String(isOpen));
  infoPanel.setAttribute("aria-hidden", String(!isOpen));

  if (infoToggleSymbol) {
    infoToggleSymbol.textContent = isOpen ? "X" : ">";
  }

  if (isOpen) {
    closeLegend();
    closeSymbolGuide();
  }
}

if (legendToggle) {
  legendToggle.addEventListener("click", toggleLegend);
}

if (symbolToggle) {
  symbolToggle.addEventListener("click", toggleSymbolGuide);
}

if (infoToggle) {
  infoToggle.addEventListener("click", toggleInfoGuide);
}

if (entryBtn) {
  entryBtn.addEventListener("click", () => {
    if (entryPanel?.classList.contains("is-open")) {
      closeEntryPanel();
      return;
    }
    openEntryPanel();
  });
}

if (entryClose) {
  entryClose.addEventListener("click", closeEntryPanel);
}

if (entryReturnCloseBtn) {
  entryReturnCloseBtn.addEventListener("click", closeEntryPanel);
}

if (infoClose) {
  infoClose.addEventListener("click", () => {
    if (introGateActive) {
      completeIntroGate();
    }
    closeInfoGuide({ force: true });
  });
}

if (infoPanel) {
  const infoDrops = Array.from(infoPanel.querySelectorAll(".info-drop"));
  infoDrops.forEach((drop) => {
    drop.addEventListener("toggle", () => {
      if (!drop.open) {
        return;
      }

      infoDrops.forEach((otherDrop) => {
        if (otherDrop !== drop) {
          otherDrop.removeAttribute("open");
        }
      });
    });
  });

  infoPanel.addEventListener("click", (event) => {
    if (event.target === infoPanel) {
      if (introGateActive) {
        remindDiscoverButton();
        return;
      }

      remindDiscoverButton();
    }
  });
}

if (entryPanel) {
  entryPanel.addEventListener("click", (event) => {
    if (event.target === entryPanel) {
      closeEntryPanel();
    }
  });
}

document.addEventListener("visibilitychange", () => {
  if (!entryPanel?.classList.contains("is-open")) {
    return;
  }

  if (document.hidden) {
    entryNeedsReturnPrompt = true;
    return;
  }

  if (entryNeedsReturnPrompt) {
    showEntryReturnPrompt();
    entryNeedsReturnPrompt = false;
  }
});

window.addEventListener("focus", () => {
  if (!entryPanel?.classList.contains("is-open")) {
    return;
  }

  if (entryNeedsReturnPrompt) {
    showEntryReturnPrompt();
    entryNeedsReturnPrompt = false;
  }
});

if (introGateActive && infoPanel && infoToggle) {
  infoPanel.classList.add("is-open");
  infoPanel.setAttribute("aria-hidden", "false");
  infoToggle.setAttribute("aria-expanded", "true");
  if (infoToggleSymbol) {
    infoToggleSymbol.textContent = "X";
  }
} else if (pageBody) {
  pageBody.classList.add("intro-complete");
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
  if (interactionsAbortController) {
    interactionsAbortController.abort();
  }
  interactionsAbortController = new AbortController();
  const { signal } = interactionsAbortController;

  const pointGroups = Array.from(document.querySelectorAll(".point-group"));

  if (!pointGroups.length) {
    return;
  }

  const linkGroups = Array.from(document.querySelectorAll(".link-group"));
  let activeArtistKey = null;
  let activeGroup = null;
  let hoveredArtistKey = null;

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

  function clearActiveSelection() {
    if (activeArtistKey) {
      setRevealState(activeArtistKey, false);
    }
    activeArtistKey = null;
    activeGroup = null;
    hidePointTooltip();
    hideLineTooltip();
    if (hoveredArtistKey) {
      setRevealState(hoveredArtistKey, true);
    }
  }

  const tooltip = ensurePointTooltip();
  tooltip.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();
      if (event.target.closest(".point-tooltip-close")) {
        clearActiveSelection();
      }
    },
    { signal }
  );

  pointGroups.forEach((group) => {
    const artistKey = group.dataset.artistKey;
    if (!artistKey) {
      return;
    }

    const pointData = {
      displayName: group.dataset.displayName || "",
      artist: group.dataset.artistName || "",
      topArtist1SpotifyName: group.dataset.topArtist1SpotifyName || "",
      topArtist1ImageUrl: group.dataset.topArtist1ImageUrl || "",
      fallbackImageUrl: group.dataset.avatarSrc || "",
      topArtist2: group.dataset.topArtist2 || "",
      topArtist3: group.dataset.topArtist3 || "",
      ageRange: group.dataset.ageRange || "",
      region: group.dataset.region || "",
    };

    group.addEventListener(
      "pointerdown",
      (event) => {
        event.stopPropagation();
      },
      { signal }
    );

    group.addEventListener(
      "pointerenter",
      () => {
        hoveredArtistKey = artistKey;
        if (!activeArtistKey) {
          setRevealState(artistKey, true);
        }
      },
      { signal }
    );

    group.addEventListener(
      "pointerleave",
      () => {
        if (hoveredArtistKey === artistKey) {
          hoveredArtistKey = null;
        }
        if (!activeArtistKey) {
          setRevealState(artistKey, false);
        }
      },
      { signal }
    );

    group.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();

        if (activeGroup === group) {
          clearActiveSelection();
          return;
        }

        clearActiveSelection();
        activeArtistKey = artistKey;
        activeGroup = group;
        setRevealState(artistKey, true);
        showPointTooltip(pointData, event);
      },
      { signal }
    );
  });

  linkGroups.forEach((link) => {
    const artistName = link.dataset.artistName || "";

    link.addEventListener(
      "pointerenter",
      (event) => {
        showLineTooltip(artistName, event);
      },
      { signal }
    );

    link.addEventListener(
      "pointermove",
      (event) => {
        positionLineTooltip(event.clientX, event.clientY);
      },
      { signal }
    );

    link.addEventListener(
      "pointerleave",
      () => {
        hideLineTooltip();
      },
      { signal }
    );
  });

  document.addEventListener(
    "click",
    () => {
      clearActiveSelection();
    },
    { signal }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        clearActiveSelection();
      }
    },
    { signal }
  );
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
      rawTopArtist1ImageUrl: pickLooseRowValue(
        row,
        (normalizedKey) =>
          normalizedKey.includes("topartist1") &&
          normalizedKey.includes("image") &&
          normalizedKey.includes("url")
      ),
      displayName: String(row?.["Display Name"] ?? row?.displayName ?? "").trim(),
      artist: String(row?.["Top Artist #1"] ?? row?.artist1 ?? "").trim(),
      genre: String(row?.["Most Listened Genre"] ?? row?.genre ?? "Other").trim(),
      gender: String(row?.Gender ?? row?.gender ?? "Prefer not to say").trim(),
      topArtist2: String(row?.["Top Artist #2"] ?? row?.artist2 ?? "").trim(),
      topArtist3: String(row?.["Top Artist #3"] ?? row?.artist3 ?? "").trim(),
      ageRange: String(row?.["Age Range"] ?? row?.ageRange ?? "").trim(),
      region: String(row?.Region ?? row?.region ?? "").trim(),
      topArtist1SpotifyName: String(row?.topArtist1SpotifyName ?? "").trim(),
      topArtist1SpotifyId: String(row?.topArtist1SpotifyId ?? "").trim(),
      topArtist1ImageUrl: String(
        row?.topArtist1ImageUrl ??
          row?.topArtist1ImageURL ??
          row?.["Top Artist 1 Image URL"] ??
          row?.["Top Artist #1 Image URL"] ??
          row?.artist1ImageUrl ??
          ""
      ).trim(),
      topArtist1SpotifyUrl: String(row?.topArtist1SpotifyUrl ?? "").trim(),
    }))
    .filter((entry) => entry.artist);

  if (!entries.length) {
    responsesContainer.innerHTML = '<p class="empty">No Top Artist #1 data yet.</p>';
    return;
  }

  const padding = 72;
  const xSpacing = 98;
  const ySpacing = 84;
  const cols = Math.max(3, Math.ceil(Math.sqrt(entries.length * 1.25)));
  const rowsCount = Math.ceil(entries.length / cols);
  const usableWidth = (cols - 1) * xSpacing + xSpacing / 2;
  const usableHeight = (rowsCount - 1) * ySpacing;
  const topSafeInset = getInitialTopSafeInset();
  const yStart = topSafeInset + FIRST_ROW_EXTRA_GAP;
  const bottomSafeInset = padding;
  const dataWidth = padding * 2 + usableWidth;
  const dataHeight = yStart + bottomSafeInset + usableHeight;
  const width = Math.max(Math.round(dataWidth), window.innerWidth);
  const height = Math.max(Math.round(dataHeight), window.innerHeight);
  const xStart = (width - usableWidth) / 2;

  const points = entries.map((entry, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const offsetX = row % 2 === 0 ? 0 : xSpacing / 2;

    return {
      displayName: entry.displayName,
      artist: entry.artist,
      genre: entry.genre || "Other",
      gender: entry.gender || "Prefer not to say",
      topArtist2: entry.topArtist2,
      topArtist3: entry.topArtist3,
      ageRange: entry.ageRange,
      region: entry.region,
      topArtist1SpotifyName: entry.topArtist1SpotifyName,
      topArtist1SpotifyId: entry.topArtist1SpotifyId,
      topArtist1ImageUrl: entry.topArtist1ImageUrl || entry.rawTopArtist1ImageUrl,
      topArtist1SpotifyUrl: entry.topArtist1SpotifyUrl,
      imageSrc: getParticipantImage(entry.gender),
      normalizedArtist: entry.artist.toLowerCase(),
      x: xStart + col * xSpacing + offsetX,
      y: yStart + row * ySpacing,
    };
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
      const artistName = group[0].artist;
      const artistNameEscaped = escapeHtml(artistName);
      const routedGroup = orderGroupPointsForFlow(group, artistName);

      for (let i = 1; i < routedGroup.length; i += 1) {
        const from = routedGroup[i - 1];
        const to = routedGroup[i];
        const d = createScribbleConnectionPath(from, to, points, `${artistName}|${i}`);
        segments += `
          <g class="link-group" data-artist-key="${escapeHtml(group[0].normalizedArtist)}" data-artist-name="${artistNameEscaped}">
            <path d="${d}" class="link-line-scribble" aria-hidden="true"></path>
            <path d="${d}" class="link-hit"></path>
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
      <g
        class="point-group"
        data-artist-key="${escapeHtml(point.normalizedArtist)}"
        data-display-name="${escapeHtml(point.displayName)}"
        data-artist-name="${escapeHtml(point.artist)}"
        data-avatar-src="${escapeHtml(point.imageSrc)}"
        data-top-artist1-spotify-name="${escapeHtml(point.topArtist1SpotifyName)}"
        data-top-artist1-image-url="${escapeHtml(point.topArtist1ImageUrl)}"
        data-top-artist2="${escapeHtml(point.topArtist2)}"
        data-top-artist3="${escapeHtml(point.topArtist3)}"
        data-age-range="${escapeHtml(point.ageRange)}"
        data-region="${escapeHtml(point.region)}"
        style="--genre-color: ${ringColor};"
      >
        <circle class="point-hover-halo" cx="${point.x}" cy="${point.y}" r="18.8"></circle>
        <circle class="point-hover-backdrop" cx="${point.x}" cy="${point.y}" r="14.6"></circle>
        <path
          class="genre-scribble"
          d="${createScribblePath(point.x, point.y, 15.2, `${point.artist}|${point.genre}|${index}`)}"
          style="fill: #02121b;"
        ></path>
        <g transform="translate(${point.x - 7.5}, ${point.y - 7.5})">
          ${getSvgInlineElement(point.imageSrc, point.gender)}
        </g>
        <circle class="point-hit" cx="${point.x}" cy="${point.y}" r="12.4"></circle>
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
    setLoadingState(true, "Finding your music connections...");
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
    setLoadingState(true, "Finding your music connections...");
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
