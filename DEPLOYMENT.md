# GitHub Pages Deployment

This site is static. GitHub Pages can serve the repository root directly.

1. Push your changes to the source branch (`main`).
2. In the repository **Settings → Pages**, set:
   - Source: the `main` branch
   - Folder: `/ (root)`
3. Wait a minute or two for the site to update.

Project screenshots live in `discontinued/img/`. The custom domain is set in `CNAME`.

No `npm run build` or `gh-pages` publish step is needed.
