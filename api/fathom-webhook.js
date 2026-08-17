// Receives Fathom's "new-meeting-content-ready" webhook (fired on Taha's
// Fathom account once a call transcript finishes processing) and stores it
// in Supabase for ProposalClub. Body parsing is disabled so the raw bytes
// are available for signature verification, same pattern as
// api/cal-webhook.js. Fathom's webhook signing is Svix-based (three
// headers, whsec_ secret), not the single-header HMAC cal.com uses, so the
// verification function below is different from cal-webhook.js's.
//
// This endpoint only ingests. It never calls an LLM and never generates a
// proposal — that happens later, on demand, in a Claude Code session (see
// the ProposalClub plan notes). Field names below are best-effort: Fathom's
// public API is new and its docs don't confirm every payload field, so the
// full raw body is always logged and stored in raw_payload for recovery if
// a field guess turns out wrong on first live delivery.
const crypto = require("crypto");
const getRawBody = require("raw-body");
const { upsertTranscript } = require("./_lib/proposalclub-supabase");
const { flagPossibleRealizadaMatch } = require("./_lib/deskclub-supabase");

module.exports.config = { api: { bodyParser: false } };

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function verifySignature(rawBody, webhookId, webhookTimestamp, webhookSignature) {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret || !webhookId || !webhookTimestamp || !webhookSignature) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(webhookTimestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  // webhook-signature can carry multiple space-separated "v1,<sig>" values.
  // Both sides are compared as the base64 *string* itself, not decoded back
  // to raw bytes (matches Svix's reference verification).
  return webhookSignature.split(" ").some((entry) => {
    const sig = entry.includes(",") ? entry.split(",")[1] : entry;
    const sigBuf = Buffer.from(sig || "", "utf8");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

function flattenTranscript(transcript) {
  if (!Array.isArray(transcript)) return "";
  return transcript
    .map((line) => {
      const speaker = line?.speaker?.display_name || "Desconocido";
      const timestamp = line?.timestamp ? `[${line.timestamp}] ` : "";
      return `${timestamp}${speaker}: ${line?.text || ""}`;
    })
    .join("\n");
}

function resolveRecordingId(payload) {
  const candidate =
    payload.recording_id ?? payload.id ?? payload.meeting_id ?? payload.recording?.id ?? payload.share_url ?? payload.url ?? payload.meeting_url;
  return candidate != null ? String(candidate) : null;
}

function resolveLead(payload) {
  const invitees = payload.calendar_invitees || payload.invitees || payload.attendees || [];
  const lead = Array.isArray(invitees) ? invitees.find((p) => !p?.is_organizer) || invitees[0] : null;
  return {
    name: lead?.name || lead?.display_name || null,
    email: lead?.email || null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const rawBody = await getRawBody(req);
  const verified = verifySignature(
    rawBody,
    req.headers["webhook-id"],
    req.headers["webhook-timestamp"],
    req.headers["webhook-signature"]
  );
  if (!verified) {
    res.status(401).json({ ok: false, error: "invalid_signature" });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    res.status(400).json({ ok: false, error: "invalid_json" });
    return;
  }

  // Logged so the real field shape can be confirmed on first live delivery,
  // same rationale as cal-webhook.js.
  console.log("fathom-webhook received:", JSON.stringify(payload));

  const fathomRecordingId = resolveRecordingId(payload);
  if (!fathomRecordingId) {
    res.status(400).json({ ok: false, error: "missing_recording_id" });
    return;
  }

  const lead = resolveLead(payload);

  try {
    const result = await upsertTranscript({
      fathomRecordingId,
      meetingTitle: payload.meeting_title || payload.title || null,
      meetingUrl: payload.meeting_url || payload.url || null,
      shareUrl: payload.share_url || null,
      recordedAt: payload.recorded_at || payload.created_at || null,
      leadName: lead.name,
      leadEmail: lead.email,
      transcriptText: flattenTranscript(payload.transcript),
      rawPayload: payload,
    });
    if (!result.ok) {
      res.status(500).json({ ok: false, error: result.error });
      return;
    }

    // Best-effort and awaited (a serverless function can be frozen right
    // after the response is sent, silently dropping an un-awaited write) --
    // but a failure here never turns into a 500: the transcript ingest
    // itself already succeeded, which is the part Fathom's retry logic
    // cares about.
    const recordedAt = payload.recorded_at || payload.created_at || null;
    if (result.id && lead.email && recordedAt) {
      await flagPossibleRealizadaMatch({ id: result.id, leadEmail: lead.email, recordedAt }).catch((err) =>
        console.error("fathom-webhook: flagPossibleRealizadaMatch failed:", err)
      );
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
};
