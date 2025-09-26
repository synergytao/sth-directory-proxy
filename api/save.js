// api/save.js — minimal, CORS-open, forgiving auth

function addCORS(req, res) {
  // OPEN CORS so the preflight can never fail (we can lock down later)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight 24h
}

export default async function handler(req, res) {
  addCORS(req, res);

  // Always answer preflight
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Only POST allowed");
  }

  try {
    // --- forgiving auth: X-API-Key or Authorization: Bearer ---
    const h = req.headers || {};
    const auth = String(h.authorization || h.Authorization || "");
    const xkey = String(h["x-api-key"] || h["X-API-Key"] || "");
    const provided =
      (xkey && xkey.trim()) ||
      (auth.startsWith("Bearer ") ? auth.slice(7).trim() : "");
    if (!provided || provided !== process.env.CLIENT_SHARED_KEY) {
      return res.status(401).send("Unauthorized");
    }

    // Read body
    const {
      json,
      message,
      owner = "synergytao",
      repo = "synergytaohub-directory",
      path = "data/directory.json",
      branch = "main",
    } = req.body || {};

    if (!json) return res.status(400).send("Bad Request: include { json }");

    const commitMsg = message || `Update ${path} via directory admin`;

    // 1) Get current file SHA
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const getRes = await fetch(getUrl, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "sth-directory-proxy",
      },
    });
    if (!getRes.ok) {
      const t = await getRes.text();
      return res.status(500).send(`GitHub GET failed: ${t}`);
    }
    const current = await getRes.json();
    const sha = current.sha;

    // 2) Base64 encode new content
    const text = typeof json === "string" ? json : JSON.stringify(json, null, 2);
    const b64 = Buffer.from(text, "utf8").toString("base64");

    // 3) PUT update
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "sth-directory-proxy",
      },
      body: JSON.stringify({ message: commitMsg, content: b64, sha, branch }),
    });
    if (!putRes.ok) {
      const t = await putRes.text();
      return res.status(500).send(`GitHub PUT failed: ${t}`);
    }

    const out = await putRes.json();
    return res.status(200).json({ ok: true, commit: out.commit?.sha || null });
  } catch (err) {
    addCORS(req, res);
    return res.status(500).send(`Server error: ${err?.message || String(err)}`);
  }
}
