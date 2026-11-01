# Magnus HQ Manual

Magnus HQ is the control room for the whole of Magnus Boy's System. It shows every company as counts and totals, the money coming in, the health of the system and the bills that keep it running. Only platform admins can open it, and only after 2-step login.

💡 Open HQ at app.magnusboys.com/hq. Anyone who is not an admin is sent back to the normal app, as if the page did not exist.

## Your daily 10 minutes

1. **Overview**: read "Needs your attention" from top to bottom. Red first, then amber. Tap a line to jump to the right tab.
2. **Leads**: answer every new demo request the same day. Tap **WhatsApp**, then **Mark called**.
3. **Money**: confirm or reject any "I've paid" claims. Check the Lynk or bank app first.
4. **Errors**: anything new or "Came back"? Tap **Ask HQ about this**, or **Copy note for developer**.
5. **Feedback**: read the problem reports (red edge). Mark them **Read**, **Planned** or **Done**.
6. **Bills**: anything due in the next 14 days? Pay it, then tap **I paid it**.
7. Optional: open **Ask HQ** and tap **Is everything OK?**

### Once a week

- **Health**: database and file space. Above 80%, clean up or upgrade the Supabase plan.
- **Traffic**: are people using it? Which screens?
- **Activity**: read what every admin did. Anything you don't recognise is a warning sign.
- **System**: the last deploys went through, and the domain is not about to expire.

### Once a month

- **Bills**: every service paid for the month.
- **Settings → Ask HQ**: what it cost this month.
- **Website**: the headline and questions are still right.

### Every April

- **Settings → Jamaican statutory rates**: when the government announces new rates, add the new set, check it against the official source, then **Confirm** it. Payroll only uses confirmed sets.

## The tabs

| Tab | What it is for |
|---|---|
| Overview | The number of companies, users and active users, money, and the "Needs your attention" list |
| Ask HQ | A chat that explains the numbers. It only suggests; you confirm |
| Companies | Every company as counts and totals. Pause, read-only, close, give free, features, export |
| Leads | Demo requests from the website, plus people who phoned. New, Called, On trial, Won, Lost |
| Money | Charging on or off, prices, payment claims, bills to companies, payments |
| Bills | The services Magnus pays for (Supabase, Vercel, domain, Anthropic...) and when each is due |
| Health | Live checks, space used, the daily job, control room mode |
| Errors | App errors from every screen, grouped. Fixed errors reopen if they come back |
| Traffic | Page views and visitors by hour and by screen |
| System | Supabase, Vercel and GitHub status, the latest deploys and commits, backups, domain expiry |
| Support | Support access the companies gave you, and what was looked at |
| Feedback | Ideas and problem reports. New, Read, Planned, Done, Spam |
| Website | Home page headline, line under it, questions and answers, privacy policy and terms |
| Settings | Message to everyone, maintenance mode, sign-ups, feature switches, support contact, statutory rates, Ask HQ |
| Activity | Every HQ action: who, what, when, and the reason |
| Admins | Who can open HQ. Only the owner can add or remove an admin |
| Manual | This page |

### Companies: what each action does

- **Pause**: the company can read but not change anything. Use it for a dispute or a check.
- **Close company**: nobody in the company can sign in. The data is deleted after 90 days unless you reopen it.
- **Delete now**: owner only, for a closed company. It can't be undone.
- **Free (never billed)**: the company is never billed. Use it for your own companies, partners and test accounts.
- **Features**: switch a feature off for one company only.
- **Export data**: download the company's data when they ask for a copy.

⚠️ Every action asks for a reason. Write a real one: it is kept in the Activity log for good.

### Money: how charging works

- **Charging OFF** (the starting state): nobody is billed, and every company has every feature.
- **Charging ON**: each company gets a bill each month from its plan. Reminders go out 7, 3 and 1 days before the due date.
- If a bill is still unpaid after the grace days, the company becomes **read-only** until it is paid.
- A company pays by Lynk or bank, then taps **I've paid**. You check your Lynk or bank app, then **Confirm** in Money. The company unlocks straight away.
- Switching Charging OFF unlocks everyone.

### Support access

A company director or admin can give you read-only access for 24 hours from their **Support access** page. You then see their records in the **Support** tab.

- Passwords, PINs, bank account numbers and TRNs are never shown.
- Every screen you open is logged and shown to the company. The first time you look, they get a notice.
- Without a grant, HQ never shows a company's documents, payroll or clients.

### Ask HQ

- It reads only what HQ shows: overview, health, open errors and settings.
- It can only suggest: a message to everyone, maintenance mode, a feature switch, or opening a tab. Nothing happens until you tap **Confirm** and write a reason.
- It stops at the monthly US$ limit set in **Settings → Ask HQ**. Each answer shows its cost.
- Tap **Read it to me** to hear an answer.

## Security: do and don't

### Do

- Keep 2-step login on your phone, **and** scan the same QR code on a second device (an old phone or a tablet) when you set it up. That is your spare key.
- Use the HQ login (magnusboysacct+hq@gmail.com) only for HQ, never for day-to-day company work.
- Sign out on shared computers. HQ signs you out after a while with no activity, unless control room mode is on.
- Turn on **control room mode** (Health tab) only on a computer that stays in a locked office. It switches itself off after 12 hours.
- Read the Activity log every week.
- Remove an admin the same day they stop working with you.

### Don't

- Never put a password, card number or key into a note, a reason, a Bills entry, the Website tab or Ask HQ.
- Never paste a key into a chat, an email or WhatsApp. Keys go only in Vercel or Supabase.
- Never share the HQ login. Add the person as an admin instead.
- Never confirm a payment before you see the money in Lynk or the bank.
- Never use maintenance mode for longer than you need. Everyone except HQ is locked out while it is on.

## When something goes wrong

| What you see | What to do |
|---|---|
| The app won't open for anyone | Open System: is Supabase or Vercel down? If it's their outage, put up a message (Settings) and wait. If not, open the latest deploy in Vercel and roll back to the one before |
| Health shows "Daily job: needs attention" | The nightly job didn't run. Tap Run daily job now in Money (owner only). If it fails again, send the error to your developer |
| Space above 90% | Clean up old files, or upgrade the Supabase plan. When it is full, uploads stop |
| Lots of the same error | Ask HQ about it, then send the developer note. If people can't work, put up an Urgent message |
| You need to fix something live | Settings → maintenance mode ON with a short message, do the fix, then switch it OFF |
| A company says it is locked | Companies: check its status. If it's unpaid, ask for payment or record it by hand in Money. If it's paused, unpause it |
| Phone alerts stopped | Tap the bell, then Send me a test. If it says a key is wrong, check the VAPID keys in Vercel |
| Ask HQ says the key is wrong or there's no credit | Check ANTHROPIC_API_KEY in Vercel and the credit in the Anthropic console |
| An admin did something you didn't expect | Admins: remove them. Activity: read what they did. Change your own password |

### You lost the phone with your authenticator app

1. If you scanned the QR code on a second device, use that and stop here.
2. Otherwise, sign in to the Supabase dashboard (that login has its own 2-step code, so keep it safe too), open **SQL Editor**, and run this. It removes the old authenticator from the HQ login only:

```
delete from auth.mfa_factors
 where user_id = (select id from auth.users where email = 'magnusboysacct+hq@gmail.com');
```

3. Sign in to app.magnusboys.com with the HQ login and open /hq. It shows a new QR code. Scan it with your new phone, **and** with a second device this time.
4. Read the Activity log to check nothing happened while the phone was lost.

⚠️ Anyone who can sign in to your Supabase dashboard can do this, so protect that account like the bank.

### You forgot the HQ password

Use **Forgot password** on the login page. The 2-step code is still asked for before HQ opens.

## For your developer

### Where things live

- Code: GitHub magnusboysacct-sketch/magnus-system-v3. The main branch is the live site (app.magnusboys.com) and develop is staging.
- Database: Supabase project julylfxbdwgekzqsxykb.
- HQ screens: src/pages/hq. HQ data calls: src/lib/hq. Server functions: api.
- The full build log of HQ is in docs/HQ_PLAN.md.

### Rules

- Platform tables have Row Level Security on and no policies. They are only reached through security definer functions that call platform_require() or platform_check(), and those need a platform admin with 2-step login (aal2).
- Company data stays private. HQ sees counts and totals only, except during a support grant the company gave.
- Secrets go only in Vercel or Supabase server variables. Never in VITE_ variables, never in the database, never in code.
- Database changes go in new numbered migration files that are safe to run twice. Never edit an old migration.

### Vercel server variables (names only)

| Name | What it is for |
|---|---|
| VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY | Already there. The public Supabase address and key |
| SUPABASE_SERVICE_ROLE_KEY | Push alerts and the Ask HQ cost log (server only) |
| VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT | Phone push alerts |
| ANTHROPIC_API_KEY | Ask HQ |
| VERCEL_TOKEN, VERCEL_PROJECT_ID (or VERCEL_PROJECT_NAME), VERCEL_TEAM_ID | System tab: deploys (optional) |
| GITHUB_TOKEN, GITHUB_REPO | System tab: commits (optional) |
| SUPABASE_ACCESS_TOKEN | System tab: backups (optional) |
| HQ_DOMAIN | System tab: domain expiry check (optional, default magnusboys.com) |

### HQ migrations, in order

```
20260955000000_platform_admin_foundation.sql
20260956000000_hq_security_scan.sql
20260956010000_definer_functions_search_path.sql
20260956020000_rls_migration_conflicts.sql
20260956030000_rls_project_actuals.sql
20260957000000_hq_overview.sql
20260958000000_hq_companies.sql
20260959000000_platform_billing.sql
20260960000000_health_errors_traffic.sql
20260961000000_platform_subscriptions.sql
20260962000000_notifications_and_push.sql
20260963000000_platform_settings_features.sql
20260963010000_statutory_rates.sql
20260964000000_support_access.sql
20260965000000_public_site_leads_feedback.sql
20260966000000_hq_leads_feedback_website.sql
20260967000000_hq_assistant.sql
```

Run each in the Supabase SQL Editor, then record it with npx supabase migration repair --status applied VERSION --linked.

### Scheduled jobs (pg_cron, UTC)

| Job | When | What it does |
|---|---|---|
| magnus-hq-daily | 06:10 every day (1:10 am Jamaica) | Bills, reminders, read-only after grace, deletes companies closed 90+ days |
| magnus-hq-bills | 06:20 every day | Reminders for the services Magnus pays for (Bills tab) |
| magnus-hq-prune | 06:40 every Sunday | Trims old traffic, error and log rows |
| magnus-push-kick | every minute | Asks /api/push-dispatch to send queued phone alerts |
| magnus-hq-health-watch | every 5 minutes | Alerts HQ admins when a health check turns to problem, and when it's back |

### Health URL for uptime monitoring

```
https://app.magnusboys.com/api/health
```

It returns 200 when everything is fine and 503 when a check fails. Add it to UptimeRobot (HTTP(s) monitor, every 5 minutes). The public status page is app.magnusboys.com/status.

### Tests

```
npm run test:health
npm run test:statutory
npm run test:hqask
```
