# Git remote (after renaming folder to CrownRecord)

```powershell
cd C:\path\to\CrownRecord
git remote add origin https://github.com/Obarayese/CrownRecord.git
git branch -M main
git push -u origin main
```

If `origin` already exists:

```powershell
git remote set-url origin https://github.com/Obarayese/CrownRecord.git
git push -u origin main
```

Publish a release on GitHub with the built `.exe` files from `npm run build:win`.
