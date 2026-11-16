# Kapraulit — block unknown calls and messages

An Android app that lets through only the people you know. Calls and texts from numbers
that are not in your contacts (or on Kapraulit's "Always allowed" list) are rejected and
kept in a log where you can review them, allow the number, or move a message back to your
inbox.

## How it works

| What | Android mechanism | What happens to unknown senders |
| --- | --- | --- |
| Calls | `CallScreeningService` + the call-screening role | Rejected before the phone rings. The call stays in the call log. |
| SMS | Default SMS app role (`SMS_DELIVER`) | Not written to the inbox; saved in Kapraulit's blocked list. |
| MMS | Default SMS app role (`WAP_PUSH_DELIVER`) | Logged as blocked. |

Android only lets the **default SMS app** keep a message out of the inbox, so Kapraulit is
also a simple messaging app: conversation list, conversation view, sending and quick
replies from the call screen.

### Rules

- Contacts and numbers on the "Always allowed" list always get through.
- **Block hidden numbers** — private / withheld callers (on by default).
- **Let repeated calls through** — if a blocked number calls again within 3 minutes it
  rings, in case it is urgent (on by default).
- **Allow codes and alerts** — texts from named senders (`BANK`, `Google`) and short codes
  are let through so verification codes keep arriving (on by default).
- If Kapraulit cannot read your contacts it blocks nothing, so it never drops messages
  from people you know.

## Requirements

Android 10 (API 29) or newer.

## Building

```sh
cd android
./gradlew testDebugUnitTest assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Open the `android/` folder in Android Studio to run it on a device. Every push also builds
the debug APK in GitHub Actions (the `Android` workflow) and uploads it as an artifact.

After installing, open Kapraulit and tap **Allow** on each item under *Setup*: call
screening, default SMS app, contacts and notifications.

## Known limitations

- **MMS from known people is not displayed yet.** Kapraulit reads the sender to decide
  whether to block, but cannot download picture or group messages. You get a notification
  and need to switch the default SMS app to read them.
- **RCS / chat messages** (e.g. Google Messages "chat") go through the messaging app's own
  service and cannot be filtered by a third-party app.
- iOS does not allow an app to block every unknown caller or sender. The closest iOS
  features are *Settings → Phone → Silence Unknown Callers* and *Settings → Messages →
  Filter Unknown Senders*.

## Code map

- `policy/` — pure Kotlin rules (`BlockPolicy`), number matching, MMS sender parsing; unit tested.
- `data/` — blocked log and allowlist (SQLite), settings, contacts lookup, `Screening` glue.
- `call/` — `UnknownCallScreeningService`.
- `sms/` — SMS/MMS receivers, sending, and the SMS store.
- `ui/` — Jetpack Compose screens.
