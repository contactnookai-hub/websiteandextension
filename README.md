# Nook

Nook | AI Answering Sidebar on Any Page. A free Chrome extension that puts your own Gemini in Chrome's side panel:
press **What's the answer?** (or Option+Shift+A / Alt+Shift+A), or highlight a question and right-click **Ask Nook**,
and it reads the page, asks Gemini, formats the answer for that site, and fills it in. It never presses Check or Submit.

- Chrome Web Store: https://chromewebstore.google.com/detail/nook-ai-answering-sidebar/fpoojjlpjldmeamnjhbmkkokjlfhdelc
- Website: https://trynook.pages.dev

## Layout

| Folder | What it is |
| --- | --- |
| `extension/` | The extension (Manifest V3), version 7.0.0. Load it unpacked from `chrome://extensions` (Developer mode → Load unpacked → pick this folder). `./zip.sh` builds the Chrome Web Store zip. |
| `website/` | The landing page. `public/` is what gets served; `tools/` rebuilds the landscape art, canvas and video poster. `./deploy.sh [project-name]` deploys `public/` to Cloudflare Pages with wrangler. |

Nook is not affiliated with Google. Gemini is a trademark of Google LLC.
