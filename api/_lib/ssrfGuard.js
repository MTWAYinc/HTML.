// Rejects private/loopback/link-local targets before any outbound fetch happens.
// No Python equivalent needed in ScoutClub — it only ever ran against a curated
// internal domain list. This endpoint accepts whatever URL a public visitor
// supplies, which makes it a textbook SSRF vector without this guard.
const dns = require("node:dns").promises;
const net = require("node:net");

function isPrivateIp(ip) {
  const type = net.isIP(ip);
  if (type === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    return false;
  }
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) {
      return isPrivateIp(lower.slice(7));
    }
    return false;
  }
  return false;
}

// Returns a normalized https URL string if safe, or null if the input is malformed
// or resolves to a disallowed target.
async function assertSafePublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return null;
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) return null;

  try {
    const records = await Promise.race([
      dns.lookup(hostname, { all: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("dns_timeout")), 3000)),
    ]);
    if (records.some((r) => isPrivateIp(r.address))) return null;
  } catch {
    // DNS failure or timeout isn't an SSRF concern by itself — let the later fetch fail naturally.
  }

  return url.toString();
}

module.exports = { assertSafePublicUrl, isPrivateIp };
