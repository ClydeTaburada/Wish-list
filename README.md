# Secret Santa (“Manito”) Gift Guide

A lightweight, single-page static website designed for a mobile QR scan, guided by **Cosmo**, an interactive inline-SVG astronaut mascot. Built with plain HTML, CSS, and vanilla JavaScript — no frameworks, no build step, and no external API calls.

## Project structure

```text
.
├── index.html          # Page markup and inline Cosmo SVG (swappable <g> groups)
├── style.css           # Deep-space styling, animations, and tap-ring CSS variables
├── script.js           # CONFIG, DIALOGUE, avatar state machine, tour, checklist, starfield
├── assets/
│   ├── step-1-product.webp
│   ├── step-2-color.webp
│   └── step-3-size.webp
└── README.md
```

## Run locally

You can open `index.html` directly or serve the folder over HTTP (recommended so browser features behave identically to production):

```bash
# Python 3
python -m http.server 8000
```

Then visit `http://localhost:8000` in your browser.

## Customize

### 1. TikTok URL, guide name, music, and fallback reply

Open `script.js` and edit the `CONFIG` object at the top of the file:

```js
const CONFIG = {
  tiktokUrl: 'https://vt.tiktok.com/ZS9P1nyWbhnu7-whfTj/', // Leave '' for "TikTok link coming soon"
  guideName: 'Cosmo',
  fallbackReply: 'Good question! I’m not sure about that one. Please ask Clyde.',
  musicEnabled: true,
  musicUrl: '', // Leave '' for the built-in space music-box synth, or set e.g. 'assets/music.mp3'
  musicVolume: 0.34,
  ...
};
```

### 2. Cosmo’s dialogue lines

All scripted responses — intro lines, quick replies, guided tour prompts, scroll comments, tap jokes, checklist cheers, and idle nudges — live in the `DIALOGUE` object right below `CONFIG` in `script.js`.

Available placeholders in any line:
- `{guideName}` — inserts `CONFIG.guideName`
- `{role}` / `{Role}` — inserts `manito` / `Manito` (male) or `manita` / `Manita` (female)
- `{name}` — inserts the visitor’s saved name, or `{role}`
- `{nameComma}` — inserts `", <name>"` if a name was saved, or nothing

### 3. Screenshot tap-ring positions

To fine-tune the pulsing Ember highlight rings on Steps 2 and 3, adjust the CSS custom properties at the top of `style.css`:

```css
--step2-ring-left: 3.6%;
--step2-ring-top: 50.1%;
--step2-ring-width: 27.6%;
--step2-ring-height: 18.5%;

--step3-ring-left: 79.2%;
--step3-ring-top: 64.5%;
--step3-ring-width: 14.8%;
--step3-ring-height: 5.0%;
```

## Deploy

### Option A: Netlify Drop (fastest)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop this project folder (`index.html`, `style.css`, `script.js`, and `assets/`).
3. Copy the generated URL and turn it into a QR code for your manito.

*(Note: you can exclude the original `.jpeg` files in the root folder when uploading — the page only uses the optimized `.webp` files in `assets/`.)*

### Option B: GitHub Pages

1. Push `index.html`, `style.css`, `script.js`, and `assets/` to a GitHub repository.
2. Open **Settings → Pages** in your repository.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, select `main` and `/ (root)`, then click **Save**.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.
