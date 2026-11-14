<div align="center">

# Turan Dock

Minimalist, zero-dependency personal link hub crafted with the **Midnight Aurora** aesthetic.

[**devenes.github.io/turan-dock ↗**](https://devenes.github.io/turan-dock/)

<br>

<a href="https://devenes.github.io/turan-dock/">
  <img src="./assets/images/og-image.png" alt="Enes Turan — Turan Dock Preview" width="520">
</a>

</div>

---

## Highlights

- **Single-File Config** — Edit profile, badges, links, contact actions, and analytics in [`config/profile.js`](./config/profile.js).
- **Zero Dependencies** — Pure HTML5, CSS3, and Vanilla ES Modules. No frameworks, bundlers, or build step.
- **Networking Ready** — Built-in SVG QR & Share modal (`<dialog>`), one-tap `.vcf` contact card, and anti-spam email copy.
- **Accessible & Secure** — WCAG 2.2 AA contrast, `prefers-reduced-motion`, `forced-colors`, strict CSP, and safe DOM rendering.
- **SEO & AI Ready** — Pre-rendered No-JS fallback HTML, `Schema.org` JSON-LD, [`llms.txt`](./llms.txt), and [`sitemap.xml`](./sitemap.xml).
- **Cookieless Telemetry** — Optional privacy-first pageview and card-click analytics via Umami Cloud.

## Quick Start

```bash
# Serve locally (ES modules require HTTP rather than file://)
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). Changes to `config/profile.js` apply immediately on reload.

After updating `config/profile.js`, optionally sync static SEO metadata, JSON-LD, No-JS HTML fallbacks, and `llms.txt`:

```bash
node scripts/sync-static.mjs
```

## Customization

Everything lives in [`config/profile.js`](./config/profile.js):

```js
export const profile = {
  name: "Your Name",
  headline: "Your Role at Company",
  canonicalUrl: "https://yourusername.github.io/your-repo/",
  location: "City, Country",
  links: [
    {
      id: "linkedin",
      label: "LinkedIn",
      url: "https://www.linkedin.com/in/yourhandle/",
      icon: "linkedin", // matches assets/icons/<icon>.svg (falls back to globe.svg)
      enabled: true,
    },
  ],
};
```

- **Reorder / Hide Links**: Change array order in `links`, or set `enabled: false` to hide temporarily.
- **Custom Icons**: Drop any `24×24` `.svg` into `assets/icons/` and reference its filename.
- **Portrait**: Replace `assets/images/profile.webp` (`400×400` WebP recommended).
- **Deploy**: Enable **GitHub Pages** from `Settings → Pages → Deploy from branch (main / root)`.

## License

[MIT](./LICENSE) © Enes Turan
