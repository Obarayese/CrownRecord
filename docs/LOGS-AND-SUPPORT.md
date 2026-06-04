# Logs and support

## Where logs are stored

| Platform | Folder |
|----------|--------|
| Windows | `%APPDATA%\crownrecord\logs\` |
| Dev mode | `%APPDATA%\Electron\logs\` (Electron app name in dev) |

Daily file: `crownrecord-YYYY-MM-DD.log`

## What gets logged

- App start (version, OS)
- Source list / capture errors
- Recording start
- Save success or failure
- Uncaught errors in the main process

No video content or script text is written to logs.

## User workflow

1. In CrownRecord → **Open log folder**
2. Attach the latest `.log` to **support@crownsoftech.com**
3. Describe what they were doing (Zoom, Meet, which source, etc.)

## Your workflow as maintainer

1. Read the log file for `ERROR` lines and timestamps.
2. Reproduce on Windows with the same source type.
3. Ship a fix in a new GitHub Release (bump version in `package.json`).

## Optional later: remote crash reports

For automatic reports, you could add [Sentry](https://sentry.io) (free tier) — only after privacy policy is on crownsoftech.com. Not required for v0.3.
