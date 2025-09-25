export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).send("ok");
  if (req.method !== "POST") return res.status(405).send("Only POST allowed");

  try {
    const auth = req.headers.authorization || "";
    const expected = `Bearer ${process.env.CLIENT_SHARED_KEY}`;
    if (auth !== expected) return res.status(401).send("Unauthorized");

    const { json, message, owner = "synergytao", repo = "synergytaohub-directory", path = "data/directory.json", branch = "main" } = req.body || {};
    if (!json) return res.status(400).send("Bad Request: include { json }");

    const commitMsg = message || `Update ${path} via directory admin`;

    // 1) Get current SHA
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    });
    const current = await getRes.json();
    const sha = current.sha;

    // 2) Encode new content
    const text = typeof json === "string" ? json : JSON.stringify(json, null, 2);
    const b64 = Buffer.from(text, "utf8").toString("base64");

    // 3) PUT update
    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: commitMsg, content: b64, sha, branch })
    });

    const out = await putRes.json();
    return res.status(200).json({ ok: true, commit: out.commit && out.commit.sha });
  } catch (err) {
    return res.status(500).send(`Server error: ${err.message}`);
  }
}
