# CrownRecord — GitHub Release (UI only)

You only need **GitHub’s website** after a one-time local build. No `gh` CLI required.

## Before each release (on your PC)

```powershell
cd C:\waflo_work\CrownRecord
git pull origin main
npm install
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build:win
```

Installers appear in `dist\`:

- `CrownRecord-0.3.1-Setup.exe`
- `CrownRecord-0.3.1-Portable.exe`

(Version in filenames matches `package.json`.)

## Create release in GitHub UI

1. Open: https://github.com/Obarayese/CrownRecord/releases/new  
2. **Choose a tag:** type `v0.3.1` → **Create new tag** (on publish)  
3. **Release title:** `CrownRecord v0.3.1`  
4. **Description:** copy from `docs/RELEASE-NOTES-v0.3.1.md`  
5. **Attach binaries:** drag both `.exe` files from `dist\`  
6. Click **Publish release**

## After publish

- Test: https://github.com/Obarayese/CrownRecord/releases/latest  
- Website download button will work automatically.

## Tag naming rule

| `package.json` version | Git tag   |
|------------------------|-----------|
| `0.3.1`                | `v0.3.1` |

Always prefix tag with `v`.

## Next version (0.3.2, etc.)

1. Bump `"version"` in `package.json`  
2. Commit & push to `main`  
3. Rebuild (`npm run build:win`)  
4. New GitHub release with tag `v0.3.2` and new `.exe` files  
