// fetch() with an AbortController-based timeout. Node's fetch has no built-in
// timeout, unlike Python's requests timeout tuple used throughout scoutclub/.
// Every caller treats a failure as "no data", never lets it throw upward.
const DEFAULT_TIMEOUT_MS = 5000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, ...opts } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...headers },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch text, returns null on any failure or non-200 (mirrors scraping.py's fetch()).
async function fetchText(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  if (!res || !res.ok) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}

// Fetch + parse JSON, returns null on any failure (mirrors the try/except ValueError pattern).
async function fetchJson(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

module.exports = { fetchWithTimeout, fetchText, fetchJson, USER_AGENT };
