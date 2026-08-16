// Server-side Supabase helper for ProposalClub's transcript ingestion and
// proposal draft state. Mirrors api/_lib/supabase.js's shape: small focused
// functions, service-role key only, never a raw client leaking out.
const { createClient } = require("@supabase/supabase-js");

let client = null;
function getClient() {
  if (client) return client;
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return client;
}

async function upsertTranscript({
  fathomRecordingId,
  meetingTitle,
  meetingUrl,
  shareUrl,
  recordedAt,
  leadName,
  leadEmail,
  transcriptText,
  rawPayload,
}) {
  const { error } = await getClient()
    .from("proposalclub_transcripts")
    .upsert(
      {
        fathom_recording_id: fathomRecordingId,
        meeting_title: meetingTitle,
        meeting_url: meetingUrl,
        share_url: shareUrl,
        recorded_at: recordedAt,
        lead_name: leadName,
        lead_email: leadEmail,
        transcript_text: transcriptText,
        raw_payload: rawPayload,
        status: "nueva",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "fathom_recording_id" }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function getLatestPendingTranscript() {
  const { data, error } = await getClient()
    .from("proposalclub_transcripts")
    .select("*")
    .eq("status", "nueva")
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, transcript: data };
}

async function getTranscriptById(id) {
  const { data, error } = await getClient().from("proposalclub_transcripts").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, transcript: data };
}

async function markTranscriptIncomplete(id, notes) {
  const { error } = await getClient()
    .from("proposalclub_transcripts")
    .update({ status: "incompleta", notes, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function saveProposalDraft({
  transcriptId,
  clientName,
  clientBrand,
  painPointHeadline,
  selectedCaseStudy,
  pdfPath,
}) {
  const { error: proposalError } = await getClient().from("proposalclub_proposals").insert({
    transcript_id: transcriptId,
    client_name: clientName,
    client_brand: clientBrand,
    pain_point_headline: painPointHeadline,
    selected_case_study: selectedCaseStudy,
    pdf_path: pdfPath,
    status: "borrador",
  });
  if (proposalError) return { ok: false, error: proposalError.message };

  const { error: transcriptError } = await getClient()
    .from("proposalclub_transcripts")
    .update({ status: "borrador_generado", updated_at: new Date().toISOString() })
    .eq("id", transcriptId);
  if (transcriptError) return { ok: false, error: transcriptError.message };

  return { ok: true };
}

module.exports = {
  upsertTranscript,
  getLatestPendingTranscript,
  getTranscriptById,
  markTranscriptIncomplete,
  saveProposalDraft,
};
