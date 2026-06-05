# CrownRecord

**CrownRecord** is a free Windows screen recorder from **[Crown Softech](https://crownsoftech.com)** — part of the Crown product line (CrownWatch, CrownWP, CrownSoft).

## Features

- Up to **1080p** recording (VP9 + Opus)
- **Webcam bubble** (Loom-style)
- **Invisible teleprompter** (not captured in the video)
- **Microphone** + **computer audio** (meetings, apps, tabs)
- Record **Zoom**, **Google Meet**, **Teams**, and any window — **no paid cloud recording required**
- **Live preview** while recording
- Choose **mic** and **camera** (including external webcam)
- Save as **WebM** (recommended) or **MP4** when supported on your PC
- Recordings stay **on your computer** — not uploaded to Crown Softech

**Support:** [support@crownsoftech.com](mailto:support@crownsoftech.com)

## Download

See **[DOWNLOAD.md](./DOWNLOAD.md)** or [GitHub Releases](https://github.com/Obarayese/CrownRecord/releases/latest).

## Quick start

1. Install from GitHub Releases (`Setup.exe` or `Portable.exe`).
2. Pick a **screen or window** (★ = Zoom, Chrome/Meet, Teams).
3. Enable **Microphone** and **Computer audio** as needed.
4. Optional: turn on **Webcam bubble** and open the **Teleprompter**.
5. **Start recording** → **Stop** → save your file locally.

## Help & logs

See **[docs/SUPPORT.md](./docs/SUPPORT.md)**.

## Develop (from source)

```bash
npm install
npm start
```

Build Windows installers locally:

```powershell
cd C:\path\to\CrownRecord
npm install
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build:win
```

Output: `dist\CrownRecord-*-Setup.exe` and `*-Portable.exe`.

## License

MIT — Crown Softech. See [LICENSE](./LICENSE).
