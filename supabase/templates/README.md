# Auth email templates

Gmail flagged the Supabase auth emails as dangerous: they are sent from `no-reply@app.magnusboys.com`, but the button pointed at `<project>.supabase.co`. These templates build the link on our own domain instead:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<path>
```

The app's `/auth/confirm` page (`src/pages/AuthConfirmPage.tsx`, logic in `src/lib/authConfirmCore.ts`) handles it:

- **signup, magiclink, email, email_change**: calls `supabase.auth.verifyOtp({ token_hash, type })`, then goes to `next` (default `/`). `next` can only be a path inside the app.
- **recovery, invite**: the one-time token is spent by the page that sets the password, so `/auth/confirm` passes it on unused to `/reset-password?token_hash=...&type=recovery` or `/accept-invite?token_hash=...&type=invite`. Those two pages are unchanged, and so are the password-reset and invite emails the app itself sends (they already link to those pages directly).

## Which file goes in which box

Supabase dashboard -> **Authentication -> Emails -> Templates**. Paste the whole file into **Message body** (switch to the source/HTML view) and set the **Subject**.

| Dashboard template | Subject | File | Link it builds |
|---|---|---|---|
| Confirm signup | `Confirm your Magnus Boy's System account` | `confirm-signup.html` | `type=signup&next=/` |
| Invite user | `You have been invited to Magnus Boy's System` | `invite.html` | `type=invite&next=/accept-invite` |
| Magic link | `Your Magnus Boy's System sign-in link` | `magic-link.html` | `type=magiclink&next=/` |
| Change email address | `Confirm your new email address for Magnus Boy's System` | `change-email.html` | `type=email_change&next=/` |
| Reset password | `Reset your Magnus Boy's System password` | `reset-password.html` | `type=recovery&next=/reset-password` |

"Reauthentication" is not used by the app and is left as it is.

## Before you paste

1. **Site URL**: Authentication -> URL Configuration -> **Site URL** must be exactly `https://app.magnusboys.com` (no trailing slash). The templates use `{{ .SiteURL }}`, so a wrong value breaks every link. Also check that `https://app.magnusboys.com/**` is in **Redirect URLs**. (This cannot be read from the repo or the CLI; check it in the dashboard.)
2. **Expiry**: the text says links expire in 1 hour, which is Supabase's default (Authentication -> Providers -> Email -> Email OTP Expiration = 3600 seconds). If you changed it, change the sentence in each file.
3. **Confirm signup is only sent when email confirmation is on.** Right now the project auto-confirms new accounts (`mailer_autoconfirm` is true), so nobody receives this email today. The template is ready for the day it is switched on.
4. After pasting, send yourself a test (Settings -> Users -> send magic link, or "Forgot password" on the login page) and check that the button and the plain link both start with `https://app.magnusboys.com/auth/confirm`.

## What the templates look like

Same layout as the portal emails (`supabase/functions/_shared/emailLayout.ts`): white card, gold top border, gold button, grey footer, light-only colours so dark-mode mail apps leave it alone. The header says "Magnus Boy's System" (no company logo, so it is right for every company). Each email has a short explanation, the button, the link written out as plain text, an expiry note and "If you did not request this, you can safely ignore this email". Plain inline-styled HTML tables: no scripts, no tracking pixels, no images.

To add a logo later, put an `<img>` (hosted on `https://app.magnusboys.com`, with `width`/`height` and `alt="Magnus Boy's System"`) in place of the `<h2>Magnus Boy's System</h2>` line of each file.

## config.toml

`supabase/config.toml` has matching `[auth.email.template.*]` entries (subject + `content_path`), so a local `supabase start` uses the same templates. Do not run `supabase config push` to deploy them: `config.toml` has no `[auth]` section for the rest of the live auth settings, and a push would write the defaults over them. Paste the templates in the dashboard as above.
