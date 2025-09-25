// api/save.js

// --- CORS helper: always attach CORS, including on OPTIONS and errors ---
function withCORS(res, origin = "*") {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  // Always attach CORS headers
  withCORS(res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(204).send(""); // no body
  }

  if (req.method !== "POST") {
    return res.status(405).send("Only POST allowed");
  }

  try {
    // ===== Forgiving auth =====
    // Accept either:
    //   Authorization: Bearer <CLIENT_SHARED_KEY>
    // or:
    //   X-API-Key: <CLIENT_SHARED_KEY>
    const headers = req.headers || {};
    const authHeader = (headers["authorization"] || headers["Authorization"] || "").toString();
    const apiKeyHeader = (headers["x-api-key"] || headers["X-API-Key"] || "").toString();

    const providedKey =
      (apiKeyHeader && apiKeyHeader.trim()) ||
      (authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "");

    if (!providedKey || providedKey !== process.env.CLIENT_SHARED_KEY) {
      return res.status(401).send("Unauthorized");
    }

    // ===== Read body =====
    const {
      json,
      message,
      owner = "synergytao",
      repo = "synergytaohub-directory",
      path = "data/directory.json",
      branch = "main"
    } = req.body || {};

    if (!json) {
      return res.status(400).send("Bad Request: include { json }");
    }

    const commitMsg = message || `Update ${path} via directory admin`;

    // ===== 1) Get current file SHA =====
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(
      path
    )}?ref=${encodeURIComponent(branch)}`;

    const getRes = await fetch(getUrl, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "sth-directory-proxy"
      }
    });

    if (!getRes.ok) {
      const t = await getRes.text();
      return res.status(500).send(`GitHub GET failed: ${t}`);
    }

    const current = await getRes.json();
    const sha = current.sha;

    // ===== 2) Base64 encode new content =====
    const text = typeof json === "string" ? json : JSON.stringify(json, null, 2);
    const b64 = Buffer.from(text, "utf8").toString("base64");

    // ===== 3) PUT update =====
    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "sth-directory-proxy"
        },
        body: JSON.stringify({ message: commitMsg, content: b64, sha, branch })
      }
    );

    if (!putRes.ok) {
      const t = await putRes.text();
      return res.status(500).send(`GitHub PUT failed: ${t}`);
    }

    const out = await putRes.json();
    return res.status(200).json({ ok: true, commit: out.commit && out.commit.sha });
  } catch (err) {
    // Ensure errors still include CORS
    withCORS(res);
    return res.status(500).send(`Server error: ${err?.message || String(err)}`);
  }
}
