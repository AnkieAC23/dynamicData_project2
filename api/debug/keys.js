const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbzhmkAAjRckw8Wr-Q_UnyTMPvUvAzQv-dp00fpH9ury8h1W--tBZs5lIw5n2Dg7Hy6glQ/exec";

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

function collectRowKeys(rows) {
  return Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );
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
    const rows = getRows(payload);

    res.status(200).json({
      count: rows.length,
      keys: collectRowKeys(rows),
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to inspect upstream form data.",
      details: error.message,
    });
  }
};
