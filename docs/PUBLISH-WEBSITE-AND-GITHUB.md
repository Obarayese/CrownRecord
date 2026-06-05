# Publish CrownRecord (website + GitHub)

## 1. Public GitHub repo (recommended name)

**`Obarayese/CrownRecord`** — https://github.com/Obarayese/CrownRecord

### Create repo (run locally)

```powershell
cd "C:\waflo_work\Loom Alternative"
git init
git add .
git commit -m "CrownRecord v0.3 — Crown Softech screen recorder"
git remote add origin https://github.com/Obarayese/CrownRecord.git
git push -u origin main
```

If `gh` is not installed: create an empty public repo on GitHub, then:

```powershell
git remote add origin https://github.com/Obarayese/CrownRecord.git
git branch -M main
git push -u origin main
```

### Release build

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build:win
```

Upload from `dist/` to **GitHub → Releases → v0.3.0**:

- `CrownRecord-0.3.0-Setup.exe`
- `CrownRecord-0.3.0-Portable.exe`

Update the download link on the website to:
`https://github.com/Obarayese/CrownRecord/releases/latest`

---

## 2. crownsoftech.com page

Copy `website/crownrecord.html` to your site:

| Hosting | Suggestion |
|---------|------------|
| WordPress | Custom HTML block or child page `/crownrecord` |
| Static host | Upload as `crownrecord/index.html` |
| Same server as main site | `https://crownsoftech.com/crownrecord/` |

Edit the GitHub download URL in that file after the repo exists.

Add a menu link: **Products → CrownRecord**.

---

## 3. Same Git account as WaFlo / Pykop?

**Yes, it can be safe** if you separate **risk**, not identity:

| Practice | Why |
|----------|-----|
| **Public repo only for CrownRecord** | No `.env`, API keys, or private Pykop/WaFlo code in this repo |
| **2FA on GitHub** | Stops account takeover |
| **Fine-grained PAT** | CI only gets `contents` on `CrownRecord`, not all orgs |
| **Different repo per product** | Compromise of one repo ≠ all secrets |
| **Never commit** `dist/`, tokens, signing certs | `.gitignore` already excludes build output |

Using one GitHub account for multiple companies is normal. **Hacking risk** rises when:

- Secrets are committed to a **public** repo
- The same machine has malware keylogging your Git credentials
- One repo mixes production backend + desktop app secrets

**Optional:** create GitHub org **`CrownSoftech`** and keep WaFlo/Pykop under separate orgs or private repos.

This desktop app **does not upload** recordings to your servers — low backend attack surface.

---

## 4. Other operating systems

| OS | Status | Notes |
|----|--------|-------|
| **Windows 10/11** | **Now** | Full features (system audio loopback, exclude-from-capture) |
| **macOS** | Planned | Needs build + macOS screen/audio APIs; teleprompter exclusion differs |
| **Linux** | Planned | PipeWire / portal capture; lower priority |

Rough effort: macOS **2–4 weeks** for a solid v1; Linux **+2 weeks** after macOS.

Tell users on the site: *“Windows today — Mac/Linux on the roadmap.”*
