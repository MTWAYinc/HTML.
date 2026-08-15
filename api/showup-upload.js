// Mints short-lived client-upload tokens so the browser on showup-prep.html
// can upload directly to Vercel Blob, bypassing the ~4.5MB body limit on
// serverless functions. Auth is transparent here: @vercel/blob picks up the
// project's BLOB_STORE_ID + automatic OIDC token from the environment, no
// BLOB_READ_WRITE_TOKEN needed.
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
        maximumSizeInBytes: 25 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    res.status(400).json({ ok: false, error: String(err) });
  }
};
