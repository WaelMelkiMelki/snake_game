# 🐍 snek

A tiny, fast, installable **Snake game** built as a Progressive Web App. No build step, no dependencies — just plain HTML, CSS, and JavaScript served as static files.

## Features

- 🎮 Classic snake gameplay with wrap-around walls
- 📱 Works on desktop and mobile (keyboard, swipe, and on-screen D-pad)
- 🏆 Local high score saved in `localStorage`
- 🔊 Retro sound effects with a mute toggle
- 📲 Installable PWA with a manifest, service worker, and offline support
- ⚡ Zero dependencies, instant load

## Run locally

From the repository root:

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

Because service workers require `localhost` or HTTPS, use a static server (not `file://`).

## Project structure

```
public/
  index.html            App shell
  styles.css            Styling
  app.js                Game logic (no dependencies)
  sw.js                 Offline service worker
  manifest.webmanifest  PWA manifest
  icons/                Generated app icons
scripts/
  gen_icons.py          Dependency-free icon generator (Python stdlib only)
```

## Regenerate icons

```bash
python3 scripts/gen_icons.py
```

The icon generator writes `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, and `apple-touch-icon.png` into `public/icons/` using only the Python standard library.

## Controls

- **Arrow keys / WASD** — move
- **Space / P / Esc** — pause or resume
- **Swipe** — move on touch screens
- **On-screen D-pad** — mobile touch controls

## License

MIT.
