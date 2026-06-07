# App Icon Assets

This directory holds build-time assets consumed by electron-builder.

## Current placeholder

`icon.ico` and `icon.png` are generated placeholders (green circle on dark background).
Replace them with your own artwork before shipping a production release.

## Required files

| File | Used for | Minimum size |
|---|---|---|
| `icon.ico` | Windows installer, taskbar, title bar | 256×256 (multi-size ICO recommended) |
| `icon.png` | Fallback / Linux | 512×512 |

## Creating a multi-size ICO (recommended for Windows)

A production-quality ICO should embed multiple resolutions so Windows picks the
right one at every DPI:

```
magick convert icon-512.png \
  -define icon:auto-resize=256,128,64,48,32,16 \
  icon.ico
```

Requires [ImageMagick 7](https://imagemagick.org/). Free GUI alternatives:
[IcoFX](https://icofx.ro/), [GIMP](https://gimp.org) (File → Export As → .ico).

## electron-builder lookup order (Windows)

1. `build/icon.ico`  ← set explicitly in `package.json` `build.win.icon`
2. `build/icon.png`  (fallback)
3. Default Electron icon (last resort)
