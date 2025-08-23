# 063.jp — Portfolio Site

Static, no-build portfolio site designed for long-term maintainability and hosted on Cloudflare Pages.

## Edit Content
- Update `data/site.json` to change profile, links, projects, and texts.
- Images live under `assets/images/`. Replace `avatar.jpg` as needed.

## Local Preview
Open `index.html` directly in a browser or use a static server:

- Python: `python3 -m http.server 8080`
- Go: `go run std/http` (or any static server)

## Deploy to Cloudflare Pages
- Project: connect this repo to Cloudflare Pages.
- Build command: none
- Build output directory: `/` (project root)
- Set custom domain to `063.jp` in Cloudflare and enable HTTPS.

## Optional
- Enable Cloudflare Web Analytics by uncommenting the snippet in `index.html` and setting your token.

## Structure
- `index.html` — single-page shell
- `404.html` — custom not found page
- `assets/` — CSS, JS, images
- `data/site.json` — all editable content
- `_headers`, `_redirects` — security headers and route rules

## License
Content is yours; code is unlicensed by default. Add a license if desired.
