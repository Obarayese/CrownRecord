# Download CrownRecord (free)

From **[Crown Softech](https://crownsoftech.com)** · Support: **support@crownsoftech.com**

## Windows users

1. Open **[GitHub Releases](https://github.com/CrownSoftech/CrownRecord/releases/latest)** (after you publish the repo).
2. Download **`CrownRecord-*-Setup.exe`** or **`*-Portable.exe`**.
3. Allow screen, mic, and camera permissions when asked.

## Record Zoom / Google Meet / Teams

Select the **★** source (Zoom Meeting, Chrome, Teams). Enable **Microphone** + **Computer audio**.

| Built-in cloud record | CrownRecord |
|----------------------|-------------|
| Often paid (Zoom/Workspace) | **Free**, local `.webm` on your PC |

## Problems?

In the app: **Open log folder** → attach `crownrecord-*.log` → email **support@crownsoftech.com**.

## Build (maintainers)

```bash
npm install
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build:win
```

Artifacts in `dist/`. See [docs/PUBLISH-WEBSITE-AND-GITHUB.md](./docs/PUBLISH-WEBSITE-AND-GITHUB.md).

## Platforms

- **Windows** — available
- **macOS / Linux** — planned (see README)
