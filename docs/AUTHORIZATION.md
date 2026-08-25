# Authorization Architecture

This document describes the intended authorization model. Keep it synchronized with `database.rules.json` and the authentication scripts whenever access behavior changes.

## Security boundary

Firebase Realtime Database Rules are the security boundary. HTML visibility, CSS classes, and JavaScript gates improve UX but must not be treated as data protection.

Google Sign-In identifies a user. It does not by itself grant administrator or Asso member access.

## Roles

### Signed-out visitor

- Can access public pages and public Firebase data only.
- Cannot read member-only resources or modify member profiles.

### Google-only user

- Has a valid Firebase Auth session.
- Has no Asso or administrator privileges unless separately verified.

### Asso member

- The normalized Google email must resolve through `assoMemberLookup` to an active `assoMembers` record.
- Can access Asso-only content such as protected offers, presentations, and replays.
- Can edit only the matching `memberProfiles/{memberId}` record.

### Complete Asso member

- Has active Asso membership.
- Has completed every field required by `assets/js/member-profile.js`.
- Completeness is a product state and does not replace Firebase authorization.

### Administrator

- Is authorized through `access/admins/{uid}`. The configured admin email list is only a temporary bootstrap mechanism.
- Administrator access is independent from Asso membership.
- Can access `admin.html` and update their own `adminProfiles/{uid}` record.
- Administrator-only profiles displayed in the Asso Membres tab are read-only there.

## Firebase paths

| Path | Purpose |
| --- | --- |
| `access/admins/{uid}` | Administrator role binding |
| `access/members/{uid}` | Signed-in UID to active Asso member binding |
| `assoMemberLookup/{emailHash}` | Normalized email hash to member lookup |
| `assoMembers/{memberId}` | Official membership and HelloAsso-controlled data |
| `memberProfiles/{memberId}` | Member-editable profile data |
| `adminProfiles/{uid}` | Administrator's own team profile |
| `assoMemberFieldAudit/{memberId}/{field}` | Latest real administrator edit per field |

Do not store a plain email as a lookup key. Use the existing normalized-email SHA-256 lookup flow.

## Required behavior

### Authentication persistence

- Authentication uses Firebase local persistence across pages.
- Entering Admin without permission shows an access-denied state and must not call `signOut()`.
- Only an explicit user action may sign the account out.

### Member profile updates

- Self-service updates write to `memberProfiles/{memberId}` with `source: "member"`.
- A member must never write to `assoMemberFieldAudit`.
- Official membership identity and HelloAsso fields remain separate from the member-editable profile.

### Administrator updates and audit

- Admin changes are compared with the values present when the edit modal was opened.
- Audit only fields that were actually changed through the Admin form.
- Creating a member must not generate an audit entry for every initial field.
- Automatically generated timestamps are not administrator-edited fields.

## Main implementation files

- `database.rules.json` — Realtime Database authorization and validation.
- `assets/js/admin-access.js` — administrator role resolution.
- `assets/js/asso-member-access.js` — signed-in user's Asso membership resolution.
- `assets/js/member-gate.js` — member-only page UX.
- `assets/js/member-profile.js` — member and administrator self-service profiles.
- `assets/js/stastic_member.js` — Admin dashboard membership management and audit writes.

## Validation checklist

After permission-related changes, verify these cases independently:

1. Signed-out visitor.
2. Google-only user.
3. Active Asso member with incomplete profile.
4. Active Asso member with complete profile.
5. Administrator who is not an Asso member.
6. Administrator who is also an Asso member.

Confirm both UI behavior and direct Firebase read/write enforcement. Run JavaScript syntax checks and parse `database.rules.json` before committing.

## Deployment

Pushing this repository updates the website through its normal hosting workflow. It does not deploy Realtime Database Rules. Rule changes require a separate Firebase deployment and must be verified against the active Firebase project afterward.
