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
