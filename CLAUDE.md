# CLAUDE.md — ttf-tech.github.io

Engineering rules for this repository. Follow these unconditionally.

---

## Git — NON-NEGOTIABLE

- **Never add `Co-Authored-By: Claude` or any AI/Anthropic attribution to a commit.** Commits are authored solely by the human engineer, using their own local git identity — never pass `--author` to override it.
- Only commit or push when explicitly asked. Show the diff/plan first if there's any ambiguity about scope.
- This repo has no PR workflow in practice — commits land straight on `main` and GitHub Pages deploys from it automatically. Treat every push to `main` as a production deploy.

---

## What this project is

A static site for Taiwan Tech France (TTF), an association for Taiwanese tech professionals in France. Hosted on **GitHub Pages** — there is no application server. The only pieces of backend-like behavior are:

- **Firebase Realtime Database** — the sole data store (members, jobs, events, announcements, surveys, sharings). Read from client-side JS (`assets/js/firebase-read.js` and friends); admin writes happen from `admin.html` gated behind Firebase Auth.
- **GitHub Actions** (`.github/workflows/`) — the only place with secrets and server-side execution. `scripts/sync-helloasso.js` runs here to pull paid memberships from HelloAsso, reconcile them into Firebase, and send Brevo welcome emails.

Because every `.html`/`.js` file in this repo is served publicly as-is, **no secret, API key, or credential may ever appear in anything outside `.github/workflows/*.yml` and `scripts/*.js` reading from `process.env`.** If a feature needs a secret, it belongs in a GitHub Actions repository secret, never in client-side code.

---

## Stack

- Vanilla HTML/CSS/JS. Tailwind via CDN (`cdn.tailwindcss.com`), Font Awesome via CDN. No bundler, no build step for the site itself.
- Firebase (Auth + Realtime Database), loaded via `firebasejs` CDN scripts.
- Node (GitHub Actions runner only) for `scripts/sync-helloasso.js` — no `package.json`/dependencies, just `fetch` and `node:crypto`.
- Brevo for transactional email (Contacts API + Transactional Email API — not the Campaigns API, which is for marketing blasts and doesn't fit a per-member triggered send).

---

## Automation architecture rules

- The HelloAsso → Firebase → Brevo sync (`scripts/sync-helloasso.js`, triggered by `.github/workflows/sync-helloasso.yml`) is **manually triggered by design** (`workflow_dispatch` only). `admin.html`'s "Sync Asso" button just opens the GitHub Actions "Run workflow" page — it does not and should not call any API directly from the browser, since that would require shipping a token in public JS. Do not add a webhook or scheduled trigger without discussing it first — the manual gate is intentional (admin reviews before member-facing emails go out).
- Any "send once" behavior (e.g. welcome emails) should follow the **stamp-on-success pattern** already used for `welcomeEmailSentAt`: check a persisted flag before acting, only set it after the external call actually succeeds, and let the next manual sync retry anything that failed. Don't build separate retry queues or scheduling for this — the existing manual re-trigger already provides it for free.
- GitHub-hosted Actions runners have no static IP. Never rely on IP allowlisting for any external API this workflow calls (bit us once with Brevo's "Adresses IP autorisées" — had to disable IP blocking for API keys since there's no IP to allowlist).

---

## Content conventions

- All member-facing copy is bilingual: **French first, then Traditional Chinese (繁體中文)**, separated by ` · `. Follow this order consistently in titles, descriptions, and UI strings.
- Resource/link cards (`resources.html`, `admin.html`) follow an established pattern: `.res-card` = icon chip (Font Awesome icon in a colored circular background) + bold title + small muted description. Match this exactly rather than introducing a new card style.
- Don't fabricate or guess external URLs. If uncertain of a real product/organization's canonical domain, verify it (WebFetch or ask) before committing it to a public page.

---

## Access & membership model — don't conflate these

Three distinct concepts exist in the data model; keep them separate:
- **Asso membership** (`assoMembers`) — paid HelloAsso members, synced by the script above. Source of truth for "official member" status.
- **`notificationConsent`** — a member's own opt-in/opt-out for newsletter-style notifications, set via their self-service profile (`member-profile.js`). Unset (not `false`) for anyone who hasn't logged in yet. Never gate a transactional/service email (e.g. welcome, payment confirmation) on this — it's for marketing-style sends only.
- **Admin access** (`admin-access.js`) — Firebase Auth-gated access to `admin.html` itself, unrelated to asso membership.

---

## Verification

There is no test suite. Verify changes like this instead:
- Node scripts: `node -c scripts/*.js` for syntax, and re-check exports still match after edits.
- HTML edits: sanity-check tag balance (e.g. `<div>`/`</div>` counts) since there's no linter wired up.
- GitHub Actions changes: don't assume a run succeeded — pull the actual log with `gh run view <id> --log` (or `gh run list --workflow=<name>.yml` first to find it) and check it, especially for anything touching secrets or external APIs.
