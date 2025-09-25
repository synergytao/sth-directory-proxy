export default function handler(req, res) {
  const len = (process.env.CLIENT_SHARED_KEY || "").length;
  const hasToken = !!process.env.GITHUB_TOKEN;
  res.setHeader("Content-Type","application/json");
  res.status(200).send(JSON.stringify({
    ok: true,
    // these DO NOT expose your keys; they just confirm presence/length
    clientSharedKeyPresent: len > 0,
    clientSharedKeyLength: len,
    githubTokenPresent: hasToken
  }));
}
