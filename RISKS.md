# Known risks

Tracked infrastructure risks for the mtwayinc.com deployment (GitHub + Vercel,
DNS on Cloudflare). Update this file when a risk here changes status.

## Vercel Hobby (free) plan is licensed for non-commercial use

**Status:** open, accepted for now. Logged 2026-08-14.

Vercel's Hobby plan terms restrict it to personal, non-commercial projects.
MTWAY INC. is a for-profit Delaware corporation, and this entire site
(index.html, Form.html, access-protocol.html / `/api` routes, and the 16
PageClub pages under `/partnership/[category]/[country]/`) runs on that plan
today.

**Why we're accepting this for now:** the site and The Access Protocol are
still pre-revenue, in validation. Upgrading before there's real traffic or
paying clients isn't worth the cost yet.

**Resolution:** upgrade to Vercel Pro (~$20/month) as soon as revenue starts
coming in from MTWAY CLUB memberships. This isn't scoped to any one page, it
applies to the whole Vercel project.

## ShowUpClub pre-call intake collects lead PII with no automated retention

**Status:** open, accepted for now. Logged 2026-08-15.

ShowUpClub's pre-call page (`showup-prep.html`) lets a lead who booked a call
with Taha submit, before the meeting: their name and email (also received
separately from the cal.com booking itself), free-text answers to three
short business-context questions, and optionally uploaded files (decks,
campaign/ad reports).

**Where it's stored:**
- Free-text answers + file links: Airtable, table `ShowUp Intake`, same base
  as `Access Protocol Leads` and the Form.html contact table.
- The files themselves: Vercel Blob. URLs are unlisted/unguessable but not
  access-controlled — anyone with the exact URL could view a file.
- Booking/meeting state (name, email, meeting time, agendada/reagendada/
  cancelada status): a new Supabase table, `showup_bookings`.

**Retention:** the intake text and files are meant to be useful only in the
window before that one specific call ("solo útil antes de esa reunión
puntual" per the spec), so the intent is to keep them no more than **30 days
after the meeting date**. As of this writing there is **no automated
deletion job** — this is a stated intent, not an enforced guarantee, until
an actual cleanup cron gets built. Booking-state rows in Supabase are kept
indefinitely, since they feed the show-up-rate / reschedule-vs-cancel
metrics the spec calls for.

**Why we're accepting this for now:** same posture as the Vercel Hobby-plan
risk above — pre-revenue, in validation, no full privacy-policy apparatus
built yet. This entry exists so the gap is a known, tracked decision rather
than a blind spot.

**Resolution:** build an automated cleanup job once volume makes manual
awareness impractical, and/or write a real privacy policy once the business
has paying clients and a legal review budget.

## ProposalClub stores full call transcripts with no automated retention

**Status:** open, accepted for now. Logged 2026-08-16.

`api/fathom-webhook.js` stores the complete transcript of every discovery
call (Taha's Fathom account) in Supabase, table `proposalclub_transcripts`.
These transcripts can include a prospect's business figures shared on the
call (AOV, ad spend, revenue) along with their name and email.

**Where it's stored:** `proposalclub_transcripts` (raw transcript text plus
the full webhook payload as `jsonb`) and `proposalclub_proposals` (the
resulting draft's metadata), same Supabase project as ShowUpClub.

**Retention:** kept indefinitely, no automated deletion job. Rows are the
only record of what was discussed on the call and feed the eventual
DeskClub lead history, so unlike ShowUpClub's pre-call intake there's no
natural "useful only until X" expiry window to apply yet.

**Why we're accepting this for now:** same posture as the other entries
above — pre-revenue, in validation, no privacy-policy apparatus built yet.

**Resolution:** revisit once DeskClub (the lead dashboard) exists and
defines a real retention/deletion policy for lead records generally.
