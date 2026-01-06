# React Portfolio Setup

## First Steps

1. **Install Node.js** (if not already installed)
   - Download from [nodejs.org](https://nodejs.org/)
   - Recommended version: 18.x or newer

2. **Install dependencies:**
```bash
npm install
```

3. **Test locally:**
```bash
npm run dev
```
Open your browser at `http://localhost:5173`

## Project Structure

```
raychev.github.io/
├── public/              # Static files (images, CNAME)
│   ├── img/            # All images
│   └── CNAME           # Custom domain configuration
├── src/                # React components
│   ├── components/     # React components
│   ├── App.jsx         # Main component
│   ├── main.jsx        # Entry point
│   └── index.css       # Styles
├── package.json        # Dependencies and scripts
└── vite.config.js      # Vite configuration
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment instructions.

## Important Notes

- Old files (`script.js`, `style.css`, original `index.html`) are preserved but no longer used
- All images have been moved to `public/img/`
- The React application uses the same styles and functionality as the original site
