const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbzhmkAAjRckw8Wr-Q_UnyTMPvUvAzQv-dp00fpH9ury8h1W--tBZs5lIw5n2Dg7Hy6glQ/exec";

const FIELD_DEFS = [
  {
    label: "Display Name",
    aliases: ["Display Name", "Display name", "Name", "display_name", "user"],
  },
  {
    label: "Top Artist #1",
    aliases: ["Top Artist #1", "Top Artist 1", "Top artist #1", "top_artist_1", "artist1"],
  },
  {
    label: "Top Artist #2",
    aliases: ["Top Artist #2", "Top Artist 2", "Top artist #2", "top_artist_2", "artist2"],
  },
  {
    label: "Top Artist #3",
    aliases: ["Top Artist #3", "Top Artist 3", "Top artist #3", "top_artist_3", "artist3"],
  },
  {
    label: "Most Listened Genre",
    aliases: [
      "Which music genre do you listen to the most? (Select one)",
      "Which music genre do you listen to the most?",
      "Most Listened Genre",
      "Genre",
      "genre",
    ],
  },
  {
    label: "Daily Music Time",
    aliases: [
      "How much music do you listen to on a daily basis?",
      "How much music do you listen to on a daily basis",
      "Daily Music Time",
      "Hours Per Day",
      "dailyMusic",
    ],
  },
  {
    label: "Most Common Listening Time",
    aliases: [
      "When do you most often listen to music? (Select one)",
      "When do you most often listen to music?",
      "When do you most often listen to music",
      "Listening Time",
      "listeningContext",
    ],
  },
  {
    label: "Age Range",
    aliases: ["What is your age range?", "Age Range", "ageRange"],
  },
  {
    label: "Gender",
    aliases: ["Which most accurately describes you?", "Gender", "gender"],
  },
  {
    label: "Region",
    aliases: ["Where do you currently live?", "Where do you currently live", "Region", "Location", "region"],
  },
  {
    label: "topArtist1SpotifyName",
    aliases: [
      "topArtist1SpotifyName",
      "Top Artist 1 Spotify Name",
      "top_artist_1_spotify_name",
      "artist1SpotifyName",
    ],
  },
  {
    label: "topArtist1SpotifyId",
    aliases: [
      "topArtist1SpotifyId",
      "Top Artist 1 Spotify Id",
      "Top Artist 1 Spotify ID",
      "top_artist_1_spotify_id",
      "artist1SpotifyId",
    ],
  },
  {
    label: "topArtist1ImageUrl",
    aliases: [
      "topArtist1ImageUrl",
      "Top Artist 1 Image Url",
      "Top Artist 1 Image URL",
      "top_artist_1_image_url",
      "artist1ImageUrl",
    ],
  },
  {
    label: "topArtist1SpotifyUrl",
    aliases: [
      "topArtist1SpotifyUrl",
      "Top Artist 1 Spotify Url",
      "Top Artist 1 Spotify URL",
      "top_artist_1_spotify_url",
      "artist1SpotifyUrl",
    ],
  },
];

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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

function pickLooseValue(row, predicate) {
  const entries = Object.entries(row || {});
  for (let i = 0; i < entries.length; i += 1) {
    const [key, raw] = entries[i];
    const value = String(raw ?? "").trim();
    if (!value) {
      continue;
    }
    if (predicate(normalizeKey(key))) {
      return value;
    }
  }
  return "";
}

function sanitizeRow(row) {
  const valueByKey = new Map(
    Object.entries(row || {}).map(([key, value]) => [normalizeKey(key), value ?? ""])
  );

  const result = FIELD_DEFS.reduce((acc, field) => {
    const matchedAlias = field.aliases.find((alias) => valueByKey.has(normalizeKey(alias)));
    acc[field.label] = matchedAlias ? valueByKey.get(normalizeKey(matchedAlias)) : "";
    return acc;
  }, {});

  if (!String(result.topArtist1SpotifyName || "").trim()) {
    result.topArtist1SpotifyName = pickLooseValue(
      row,
      (k) => k.includes("topartist1") && k.includes("spotify") && k.includes("name")
    );
  }

  if (!String(result.topArtist1SpotifyId || "").trim()) {
    result.topArtist1SpotifyId = pickLooseValue(
      row,
      (k) => k.includes("topartist1") && k.includes("spotify") && k.includes("id")
    );
  }

  if (!String(result.topArtist1ImageUrl || "").trim()) {
    result.topArtist1ImageUrl = pickLooseValue(
      row,
      (k) => k.includes("topartist1") && k.includes("image") && k.includes("url")
    );
  }

  if (!String(result.topArtist1SpotifyUrl || "").trim()) {
    result.topArtist1SpotifyUrl = pickLooseValue(
      row,
      (k) => k.includes("topartist1") && k.includes("spotify") && k.includes("url")
    );
  }

  return result;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const upstreamResponse = await fetch(`${APPS_SCRIPT_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!upstreamResponse.ok) {
      throw new Error(`Upstream request failed with HTTP ${upstreamResponse.status}`);
    }

    const payload = await upstreamResponse.json();
    const rows = getRows(payload).map(sanitizeRow);

    res.status(200).json({
      count: rows.length,
      refreshedAt: new Date().toISOString(),
      rows,
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to fetch upstream form data.",
      details: error.message,
    });
  }
};
