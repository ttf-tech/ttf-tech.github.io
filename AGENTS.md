# Project Instructions

## Authorization

- Before changing authentication, member access, Firebase paths, or gated UI, read `docs/AUTHORIZATION.md` completely.
- `database.rules.json` is the security boundary; hiding content in HTML or JavaScript is not authorization.
- Google Sign-In proves identity only. Admin and Asso membership are separate roles.
- A non-admin visiting `admin.html` must never be signed out automatically.
- Members may edit only their own profile. Member self-edits must never create admin audit records.
- Admin audit records must include only fields actually changed by an admin.
- A Git push does not deploy Firebase Database Rules.
- Never commit member email lists, credentials, tokens, or other secrets.

## Validation

- Run `node --check` for changed JavaScript and validate `database.rules.json` after permission changes.
- Test signed-out, Google-only, Asso member, complete Asso member, and admin behavior separately.
