# Magnus Workers (Android app)

The worker portal (`https://app.magnusboys.com/worker`) inside an Android app. Same website, same login (worker number + PIN);
the app adds what a website can't do on a locked phone:

* **Clock-in site checks keep running with the phone locked** (a "You are clocked in" notification shows while it runs), so a worker
  who leaves the site is clocked out even with the phone in a pocket.
* **"Are you still on the site?"** comes as a phone notification.

Because the app shows the live website, almost every change to the portal reaches the phones by itself. A new app file is only
needed when something in this folder changes.

## How it is built (nobody needs Android Studio)

GitHub builds it: `.github/workflows/android-worker-app.yml` runs when anything in `mobile/` changes on `main` (or by hand:
GitHub → Actions → "Android worker app" → Run workflow). It signs the app with the company key and publishes it as a GitHub
release. The install link that always points at the newest one:

    https://github.com/magnusboysacct-sketch/magnus-system-v3/releases/latest/download/magnus-workers.apk

The page `app.magnusboys.com/get-app` shows workers how to install it.

## The signing key (very important)

GitHub secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` hold the release key. It is **never** in this repository.
Every version must be signed with the SAME key or phones refuse the update, so keep the backup copy of the key file safe.
