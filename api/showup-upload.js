// Mints short-lived client-upload tokens so the browser on showup-prep.html
// can upload directly to Vercel Blob, bypassing the ~4.5MB body limit on
// serverless functions. Auth via BLOB_READ_WRITE_TOKEN (set on the Vercel
// project) — the BLOB_STORE_ID/OIDC-only auth this originally assumed
// doesn't actually work for this project's setup, confirmed in testing.
const { handleUpload } = require("@vercel/blob/client");

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        addRandomSuffix: true,
        maximumSizeInBytes: 30 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    res.status(400).json({ ok: false, error: String(err) });
  }
};
