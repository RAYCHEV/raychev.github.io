# GitHub Pages Deployment Guide

## Initial Setup

1. Install dependencies:
```bash
npm install
```

2. Test locally:
```bash
npm run dev
```

## Deploy to GitHub Pages

### Option 1: Automatic deployment with gh-pages

1. Install `gh-pages` globally (if not already installed):
```bash
npm install -g gh-pages
```

2. Deploy:
```bash
npm run deploy
```

This will:
- Create a production build
- Publish the `dist` folder to the `gh-pages` branch
- GitHub Pages will automatically serve the site

### Option 2: Manual deployment

1. Create a build:
```bash
npm run build
```

2. Copy the contents of the `dist` folder to the root of the `gh-pages` branch or to the `docs` folder in the main branch.

## GitHub Pages Configuration

1. Go to your GitHub repository settings
2. Go to the "Pages" section
3. Select source branch: `gh-pages` (or `main` if you're using the `docs` folder)
4. Select `/ (root)` as the folder

## Important Notes

- Images should be in the `public/img/` folder (not in `src/`)
- All static files should be in the `public/` folder
- After each deployment, GitHub Pages may take a few minutes to update the site
