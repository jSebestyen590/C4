# Members

A member is a person with a Cognito account **plus** a profile row in the database. Cognito owns
login data (username, email, password); the database owns everything else.

## Data model

Table `mitglieder`, keyed by the Cognito `sub` (migrations `0002`–`0005`; Aurora DSQL allows one DDL
statement per migration, no foreign keys and no `ALTER ... SET NOT NULL`, so columns added later are
nullable).

| Column                             | Notes                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- |
| `vorname`, `nachname`              | Required (empty strings for invited members until they fill them in). |
| `status`                           | `anwaerter` (default), `mitglied`, `em`. Only admins change it.       |
| `anrede`                           | `maennlich`, `weiblich`, `neutral`; null is treated as neutral.       |
| `adresse`, `telefon`, `ueber_mich` | Optional free text.                                                   |
| `kontaktkanaele`                   | Comma-separated channels, e.g. `whatsapp,mail` (see below).           |
| `discord_name`                     | Discord username, display only.                                       |
| `profilbild_key`                   | S3 key of the large picture; null without a picture.                  |

The **username** (Cognito `preferred_username`) and **email** are read from Cognito, not stored.
The member list is the union of all profile rows and all enabled Cognito accounts, so members that
have not finished activation (or have no row yet) still appear.

## Creating members

An admin invites a member by email (`POST /api/admin/users`). The Cognito account **and** the profile
row (with the chosen initial status) are created at once. On first login the member is sent to
`/profil` until username and name are set. Self sign-up is disabled.

## Permissions

Effective permissions are computed in the API on every request
(`packages/shared/src/roles.ts`, `packages/api/src/auth.ts`):

```
permissions = STATUS_PERMISSIONS[status]  ∪  ROLE_PERMISSIONS[cognito groups]
```

- `status` comes from the profile row; a missing row counts as `anwaerter`.
- The only Cognito group is `admin` (`users:manage`). Everything else follows the status.
- The web app reads the result from `GET /api/me` (`can()` in `auth.tsx`); the token groups are not
  used for the UI.
- All statuses currently get the same permissions; give them different ones in `STATUS_PERMISSIONS`
  when features need it. Responsibilities (e.g. moderator) that carry extra permissions are planned,
  stored in the database per member, and are **not built yet**.

## Gendered texts

Texts that name a person (status, roles) exist in a male, female and neutral form
(`Gegendert` in `packages/web/src/i18n.ts`). Use `labelFuer(labels, value, anrede)` with the
`anrede` of the person the text is about.

## Contact channels

Channels: WhatsApp, Telegram, Signal, Discord, Mail. Shown as icons everywhere (grayed out when not
chosen); the profile edits them as toggle buttons. Chosen channels link to the app:

| Channel  | Link                             | Built from     |
| -------- | -------------------------------- | -------------- |
| WhatsApp | `https://wa.me/<number>`         | phone number   |
| Signal   | `https://signal.me/#p/+<number>` | phone number   |
| Telegram | `https://t.me/+<number>`         | phone number   |
| Mail     | `mailto:<address>`               | Cognito email  |
| Discord  | none (name is displayed only)    | `discord_name` |

The free-text phone number is normalized by `telefonNormalisieren` (German default `+49` for a
leading `0`; unreadable numbers give no link). Code: `packages/shared/src/kontakt.ts`.

Discord cannot be linked by username. A bot on the club server could resolve names to user IDs
(`GET /guilds/{id}/members/search`) — not built; needs a bot token and the Server Members intent.

## Profile pictures

Chosen in the profile, cropped to a square in the browser (`react-easy-crop`). Two JPEG/PNG files are
uploaded straight to S3 with presigned URLs:

- **large**: the selected area at full resolution (PNG stays PNG, otherwise 95 % JPEG), up to 20 MB;
  shown only in the enlarged overlay of the detail page.
- **small**: the selected area at most 256 px (JPEG), key = large key with `-klein.jpg`; used
  everywhere else.

Only `profilbild_key` (large) is stored; the small key is derived (`kleinKey`). Replacing or removing
a picture deletes both files. Keys must lie under `profilbilder/<own sub>/`.

## Username and URLs

The username is chosen on the profile page (Cognito alias, unique, 3–64 chars of `A-Za-z0-9._-`, must
not look like a UUID). The detail page lives at `/mitglieder/<username>`; members without a username
are addressed by their `sub`. Changing the username on one's own detail page moves the URL along.

## Email change

`PUT /api/me/email` starts the change with the user's own access token (Cognito
`UpdateUserAttributes`), `POST /api/me/email/bestaetigen` confirms the emailed code. Needs the scope
`aws.cognito.signin.user.admin`; users who logged in before that scope existed must sign in again.

## Pages and API

| Page                 | Who                | Purpose                                                                                |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `/profil`            | every member       | Edit own profile (also first-login gate)                                               |
| `/mitglieder`        | `mitglieder:lesen` | List (cards on phones, sortable table from `sm`); admins also see roles and can invite |
| `/mitglieder/<name>` | `mitglieder:lesen` | Detail; own page is editable; admins change status and roles                           |

| Route                                                                         | Notes                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------- |
| `GET/PUT /api/me/mitglied`                                                    | Own profile                               |
| `PUT /api/me/username`, `PUT /api/me/email`, `POST /api/me/email/bestaetigen` | Cognito-backed                            |
| `POST /api/me/profilbild`                                                     | Presigned upload URLs (large + small)     |
| `GET /api/mitglieder`, `GET /api/mitglieder/:kennung`                         | `rollen` only sent to admins              |
| `PUT /api/admin/mitglieder/:sub/status`                                       | Admin                                     |
| `PUT /api/admin/mitglieder/:sub/rollen`                                       | Admin; cannot remove one's own admin role |
| `POST /api/admin/users`                                                       | Admin; invite + profile row               |

The Lambda needs the Cognito permissions listed in `infra/modules/app/main.tf`, including
`ListUsersInGroup` for the role column.

## Database resets (dev only)

`pnpm db:reset` drops all tables (needs `CONFIRM_DB_RESET=yes`); the Deploy workflow has a `reset_db`
input that only works for `dev`.
