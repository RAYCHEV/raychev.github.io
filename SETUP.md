# Setup

This is a static HTML, CSS, and JavaScript site. There is no npm install or build step.

## Preview locally

Serve the project root with any static file server, for example:

```bash
npx --yes serve .
```

Then open the printed local URL.

## Project structure

```
raychev.github.io/
├── index.html          # Live Projects page (GitHub Pages default)
├── live-projects/      # Redirects to /
├── discontinued/       # Older projects + screenshots
│   └── img/
├── cv/                 # CV page
├── projects/           # Redirects to /discontinued/
├── csv-viewer/         # CSV Viewer page
├── contact/            # Contact page
├── style.css
├── script.js
├── js/csv-viewer.js
├── img/                # Images
├── CNAME               # Custom domain
└── 404.html
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md).
