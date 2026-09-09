# Print Big (web)

## Deployment
- Live: https://printbig.mpeddicord.com (Cloudflare Pages project `printbig`, printbig-6yc.pages.dev)
- Source of truth: https://github.com/mpeddicord/print-big (public). This folder is the working copy; commit and push here.
- Deploy folder: index.html, app.js, style.css, sample/ (no build step)
- Only the laptop (user-pc, user@100.121.41.31) holds CLOUDFLARE_API_TOKEN; the desktop wrangler is logged out. Redeploy from the desktop:
  1. `scp -r <deploy folder> user@100.121.41.31:printbig`  (lands at C:\Users\User\printbig)
  2. `ssh user@100.121.41.31 "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\publish-cf.ps1 -Subdomain printbig -Path C:\Users\User\printbig"`
  publish-cf.ps1 is the Cloudflare half of the laptop's ~/.claude/skills/publish-page (project, upload, custom domain, DNS). The full skill also pushes to GitHub, but the laptop's gh token is expired, so push to GitHub from the desktop instead.
- Listed on https://aiprojects.mpeddicord.com (entry `print-big`). To change its card, edit E:\projects\code\aiprojects\build\overrides.json and rebuild there (see that folder's CLAUDE.md).
- The original script lives at E:\projects\code\print_big; this app keeps its defaults (Letter, 0.25 in overlap, 0.3 in margin, cut marks, labels, cover sheet). `node test/run.mjs` drives Edge through puppeteer-core and checks the generated PDFs.
