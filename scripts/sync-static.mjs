#!/usr/bin/env node
/**
 * Synchronizes static SEO, AI discoverability, and No-JS fallback artifacts
 * (`index.html`, `llms.txt`, `sitemap.xml`, `robots.txt`) from `config/profile.js`.
 *
 * Usage:
 *   node scripts/sync-static.mjs          # Write updated static files
 *   node scripts/sync-static.mjs --check  # Verify files are in sync (exits 1 on drift)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { profile } from "../config/profile.js";
import { resolveIconPath, validateExternalUrl } from "../assets/js/main.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

function getCanonicalUrl(config) {
  const valid = validateExternalUrl(config?.canonicalUrl);
  if (!valid) {
    return "https://devenes.github.io/turan-dock/";
  }
  return valid.endsWith("/") ? valid : `${valid}/`;
}

function getEnabledLinks(config) {
  const rawLinks = Array.isArray(config?.links) ? config.links : [];
  const result = [];
  for (const item of rawLinks) {
    if (!item || item.enabled === false) {
      continue;
    }
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const url = validateExternalUrl(item.url);
    if (!label || !url) {
      continue;
    }
    const id =
      typeof item.id === "string" && /^[a-z0-9-]+$/i.test(item.id.trim())
        ? item.id.trim()
        : "";
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    const iconPath = resolveIconPath(item.icon);
    result.push({ id, label, url, description, iconPath });
  }
  return result;
}

function buildJsonLd(config, canonicalUrl, enabledLinks) {
  const name = config?.name?.trim() || "Profile";
  const jobTitle =
    config?.contact?.jobTitle?.trim() || config?.headline?.trim() || undefined;
  const organization = config?.contact?.organization?.trim() || undefined;
  const description =
    config?.seo?.description?.trim() || config?.description?.trim() || undefined;
  const location = config?.location?.trim() || undefined;
  const avatarSrc =
    typeof config?.avatar === "string"
      ? config.avatar.trim()
      : config?.avatar?.src?.trim() || "./assets/images/profile.webp";
  const imageUrl = new URL(avatarSrc, canonicalUrl).href;

  const badgeLabels = (Array.isArray(config?.badges) ? config.badges : [])
    .map((b) => (typeof b === "string" ? b.trim() : b?.label?.trim() || ""))
    .filter(Boolean);

  const knowsAbout = Array.isArray(config?.seo?.knowsAbout)
    ? config.seo.knowsAbout.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const personEntity = {
    "@type": "Person",
    "@id": `${canonicalUrl}#person`,
    name,
    ...(jobTitle ? { jobTitle } : {}),
    ...(organization
      ? {
          worksFor: {
            "@type": "Organization",
            name: organization,
          },
        }
      : {}),
    ...(description ? { description } : {}),
    url: canonicalUrl,
    image: imageUrl,
    ...(location
      ? {
          homeLocation: {
            "@type": "Place",
            name: location,
          },
        }
      : {}),
    ...(badgeLabels.length > 0 ? { award: badgeLabels } : {}),
    ...(knowsAbout.length > 0 ? { knowsAbout } : {}),
    ...(enabledLinks.length > 0
      ? { sameAs: enabledLinks.map((l) => l.url) }
      : {}),
  };

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: config?.seo?.title?.trim() || name,
    ...(description ? { description } : {}),
    inLanguage: "en",
    mainEntity: personEntity,
  };
}

function buildIndexHtml(config) {
  const canonicalUrl = getCanonicalUrl(config);
  const enabledLinks = getEnabledLinks(config);
  const name = config?.name?.trim() || "Profile";
  const headline = config?.headline?.trim() || "";
  const location = config?.location?.trim() || "";
  const description = config?.description?.trim() || "";
  const seoTitle =
    config?.seo?.title?.trim() ||
    (headline ? `${name} — ${headline}` : name);
  const seoDescription =
    config?.seo?.description?.trim() || description || seoTitle;
  const ogImageUrl = new URL("./assets/images/og-image.png", canonicalUrl).href;
  const avatarSrc =
    typeof config?.avatar === "string"
      ? config.avatar.trim()
      : config?.avatar?.src?.trim() || "./assets/images/profile.webp";
  const avatarAlt =
    typeof config?.avatar === "object" && config.avatar?.alt?.trim()
      ? config.avatar.alt.trim()
      : `${name} portrait`;

  const displayUrl = (() => {
    const u = new URL(canonicalUrl);
    return `${u.host}${u.pathname.replace(/\/+$/, "")}`;
  })();

  const badges = (Array.isArray(config?.badges) ? config.badges : [])
    .map((entry) => {
      const label =
        typeof entry === "string" ? entry.trim() : entry?.label?.trim() || "";
      if (!label) return "";
      const iconName =
        typeof entry === "object" && typeof entry?.icon === "string"
          ? entry.icon.trim()
          : "";
      const iconHtml = iconName
        ? `<img class="badge-icon" src="${escapeHtml(resolveIconPath(iconName))}" alt="" width="15" height="15" decoding="async" aria-hidden="true">`
        : "";
      return `          <span class="badge-pill">${iconHtml}<span>${escapeHtml(label)}</span></span>`;
    })
    .filter(Boolean)
    .join("\n");

  const linksHtml = enabledLinks
    .map((item, idx) => {
      const dataAttr = item.id ? ` data-link-id="${escapeHtml(item.id)}"` : "";
      const umamiAttr = ` data-umami-event="${escapeHtml(`Card: ${item.label}`)}"`;
      const descHtml = item.description
        ? `\n                <span class="link-description">${escapeHtml(item.description)}</span>`
        : "";
      return `          <li class="links-item" style="--sibling-index: ${idx + 1};">
            <a class="link-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"${dataAttr}${umamiAttr}>
              <span class="link-icon-wrap" aria-hidden="true">
                <img class="link-icon" src="${escapeHtml(item.iconPath)}" alt="" width="20" height="20" decoding="async" aria-hidden="true">
              </span>
              <span class="link-content">
                <span class="link-label">${escapeHtml(item.label)}</span>${descHtml}
              </span>
              <span class="link-arrow-wrap" aria-hidden="true">
                <img class="link-arrow" src="./assets/icons/external-link.svg" alt="" width="18" height="18" decoding="async" aria-hidden="true">
              </span>
            </a>
          </li>`;
    })
    .join("\n");

  const footerText = config?.footer?.text?.trim() || "";
  const footerRepoUrl = validateExternalUrl(config?.footer?.repoUrl);
  const footerRepoLabel =
    config?.footer?.repoLabel?.trim() || "GitHub Repository";
  const footerParts = [];
  if (footerText) {
    footerParts.push(`<span>${escapeHtml(footerText)}</span>`);
  }
  if (footerText && footerRepoUrl) {
    footerParts.push(`<span class="footer-sep" aria-hidden="true">•</span>`);
  }
  if (footerRepoUrl) {
    footerParts.push(
      `<a class="footer-link" href="${escapeHtml(footerRepoUrl)}" target="_blank" rel="noopener noreferrer" data-umami-event="Footer: Source Repo">${escapeHtml(footerRepoLabel)}</a>`
    );
  }

  const umamiIdRaw =
    typeof config?.analytics?.umamiWebsiteId === "string"
      ? config.analytics.umamiWebsiteId.trim()
      : "";
  const umamiScriptUrl =
    validateExternalUrl(config?.analytics?.umamiScriptUrl) ||
    "https://cloud.umami.is/script.js";
  const umamiEnabled =
    config?.analytics?.enabled !== false &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      umamiIdRaw
    );
  const canonicalHost = new URL(canonicalUrl).hostname;
  const umamiOrigin = new URL(umamiScriptUrl).origin;

  const cspContent = umamiEnabled
    ? `default-src 'self'; script-src 'self' ${umamiOrigin}; connect-src 'self' https://gateway.umami.is ${umamiOrigin} https://api-gateway.umami.dev; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none';`
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none';";

  const umamiHeadScript = umamiEnabled
    ? `\n  <!-- Privacy-first, cookieless analytics (Umami Cloud) -->\n  <script defer src="${escapeHtml(umamiScriptUrl)}" data-website-id="${escapeHtml(umamiIdRaw)}" data-domains="${escapeHtml(canonicalHost)}"></script>`
    : "";

  const jsonLd = JSON.stringify(
    buildJsonLd(config, canonicalUrl, enabledLinks),
    null,
    2
  ).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="text-scale" content="scale">
  <meta http-equiv="Content-Security-Policy" content="${cspContent}">
  <meta name="referrer" content="strict-origin-when-cross-origin">

  <title>${escapeHtml(seoTitle)}</title>
  <meta name="description" content="${escapeHtml(seoDescription)}">
  <meta name="author" content="${escapeHtml(name)}">
  <meta name="theme-color" content="#060913">

  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="alternate" type="text/plain" href="./llms.txt" title="LLM Profile Summary">
  <link rel="icon" href="./favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeHtml(name)}">
  <meta property="og:title" content="${escapeHtml(seoTitle)}">
  <meta property="og:description" content="${escapeHtml(seoDescription)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(seoTitle)}">

  <!-- Twitter / X Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@thedevenes">
  <meta name="twitter:creator" content="@thedevenes">
  <meta name="twitter:title" content="${escapeHtml(seoTitle)}">
  <meta name="twitter:description" content="${escapeHtml(seoDescription)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(seoTitle)}">

  <!-- Structured Data (Schema.org ProfilePage + Person) -->
  <script type="application/ld+json" id="profile-jsonld">
${jsonLd}
  </script>

  <link rel="stylesheet" href="./assets/css/style.css">
  <script type="module" src="./assets/js/main.js"></script>${umamiHeadScript}
</head>
<body>
  <!-- Decorative Midnight Aurora ambient background -->
  <div class="aurora-bg" aria-hidden="true">
    <div class="aurora-orb aurora-orb--teal"></div>
    <div class="aurora-orb aurora-orb--blue"></div>
    <div class="aurora-orb aurora-orb--violet"></div>
    <div class="aurora-grain"></div>
  </div>

  <div class="page-shell">
    <main class="profile-main" id="main-content">
      <section class="profile-header" aria-labelledby="profile-name">
        <div class="avatar-frame" id="avatar-frame">
          <div class="avatar-ring" aria-hidden="true"></div>
          <img
            id="profile-avatar"
            class="profile-avatar"
            src="${escapeHtml(avatarSrc)}"
            alt="${escapeHtml(avatarAlt)}"
            width="116"
            height="116"
            fetchpriority="high"
          >
        </div>

        <h1 id="profile-name" class="profile-name">${escapeHtml(name)}</h1>

        <p id="profile-headline" class="profile-headline"${headline ? "" : " hidden"}>${escapeHtml(headline)}</p>

        <div id="profile-badges" class="profile-badges"${badges ? "" : " hidden"}>
${badges}
        </div>

        <p id="profile-location" class="profile-location"${location ? "" : " hidden"}>${
          location
            ? `<img class="location-icon" src="./assets/icons/map-pin.svg" alt="" width="15" height="15" decoding="async" aria-hidden="true"><span>${escapeHtml(location)}</span>`
            : ""
        }</p>

        <p id="profile-description" class="profile-description"${description ? "" : " hidden"}>${escapeHtml(description)}</p>
      </section>

      <!-- Pre-rendered static links work with zero JavaScript and are hydrated dynamically -->
      <nav class="links-nav" aria-label="Social and professional links">
        <ul id="links-list" class="links-list">
${linksHtml}
        </ul>
      </nav>

      <!-- Interactive Quick Contact Actions (progressive enhancement; hidden when JS is disabled) -->
      <div id="quick-actions" class="quick-actions" role="group" aria-label="Quick contact actions" hidden>
        <button
          type="button"
          id="open-qr-btn"
          class="action-pill"
          command="show-modal"
          commandfor="qr-dialog"
          data-umami-event="Action: QR &amp; Share"
        >
          <img class="btn-icon" src="./assets/icons/qr-code.svg" alt="" width="17" height="17" decoding="async" aria-hidden="true">
          <span>QR &amp; Share</span>
        </button>

        <button
          type="button"
          id="save-vcard-btn"
          class="action-pill"
          data-umami-event="Action: Save Contact"
        >
          <img class="btn-icon" src="./assets/icons/vcard.svg" alt="" width="17" height="17" decoding="async" aria-hidden="true">
          <span>Save Contact</span>
        </button>

        <button
          type="button"
          id="copy-email-btn"
          class="action-pill"
          command="--copy-email"
          commandfor="copy-email-btn"
          data-umami-event="Action: Copy Email"
        >
          <img class="btn-icon btn-icon--default" src="./assets/icons/mail.svg" alt="" width="17" height="17" decoding="async" aria-hidden="true">
          <img class="btn-icon btn-icon--copied" src="./assets/icons/check.svg" alt="" width="17" height="17" decoding="async" aria-hidden="true">
          <span data-default-label="Copy Email" data-copied-label="Email Copied" data-failed-label="Copy Failed">Copy Email</span>
        </button>
      </div>
    </main>

    <footer id="site-footer" class="site-footer"${footerParts.length ? "" : " hidden"}>
      <p class="footer-inner">${footerParts.join("")}</p>
    </footer>
  </div>

  <!-- Native Modal Dialog for Conference QR Code & Sharing -->
  <dialog id="qr-dialog" class="qr-dialog" closedby="any" aria-labelledby="qr-dialog-title">
    <div class="qr-dialog-panel">
      <div class="qr-dialog-header">
        <div class="qr-dialog-heading-group">
          <h2 id="qr-dialog-title" class="qr-dialog-title">Share Profile</h2>
          <p class="qr-dialog-subtitle">Scan QR code or share direct link</p>
        </div>
        <button
          type="button"
          id="close-qr-btn"
          class="dialog-close-btn"
          command="close"
          commandfor="qr-dialog"
          aria-label="Close Share Profile dialog"
        >
          <img src="./assets/icons/close.svg" alt="" width="18" height="18" decoding="async" aria-hidden="true">
        </button>
      </div>

      <div class="qr-stage">
        <div id="qr-code-mount" class="qr-code-mount"></div>
        <p id="qr-url-display" class="qr-url-display">${escapeHtml(displayUrl)}</p>
      </div>

      <input type="hidden" id="share-url-source" value="${escapeHtml(canonicalUrl)}">

      <div class="qr-dialog-actions">
        <span class="copy-action-wrap">
          <button
            type="button"
            id="modal-copy-link-btn"
            class="modal-btn modal-btn--primary"
            command="--copy"
            commandfor="share-url-source"
            data-umami-event="Modal: Copy Link"
            autofocus
          >
            <img class="btn-icon btn-icon--default" src="./assets/icons/copy.svg" alt="" width="18" height="18" decoding="async" aria-hidden="true">
            <img class="btn-icon btn-icon--copied" src="./assets/icons/check.svg" alt="" width="18" height="18" decoding="async" aria-hidden="true">
            <span data-default-label="Copy Link" data-copied-label="Link Copied" data-failed-label="Copy Failed">Copy Link</span>
          </button>
          <span class="copy-tip" role="status"></span>
        </span>

        <button
          type="button"
          id="modal-native-share-btn"
          class="modal-btn modal-btn--secondary"
          data-umami-event="Modal: Native Share"
          hidden
        >
          <img class="btn-icon" src="./assets/icons/share.svg" alt="" width="18" height="18" decoding="async" aria-hidden="true">
          <span>Share…</span>
        </button>

        <button
          type="button"
          id="modal-download-qr-btn"
          class="modal-btn modal-btn--secondary"
          data-umami-event="Modal: Save QR"
        >
          <img class="btn-icon btn-icon--default" src="./assets/icons/download.svg" alt="" width="18" height="18" decoding="async" aria-hidden="true">
          <img class="btn-icon btn-icon--copied" src="./assets/icons/check.svg" alt="" width="18" height="18" decoding="async" aria-hidden="true">
          <span data-default-label="Save QR" data-copied-label="Saved SVG">Save QR</span>
        </button>
      </div>
    </div>
  </dialog>

  <!-- Screen reader live region fallback & Persistent Toast Region -->
  <p class="visually-hidden">Screen reader announcements</p>
  <div id="sr-announcer" class="visually-hidden" aria-live="polite" aria-atomic="true"></div>
  <div id="toast-region" class="toast-region" role="region" aria-label="Notifications"></div>
</body>
</html>
`;
}

function buildLlmsTxt(config) {
  const canonicalUrl = getCanonicalUrl(config);
  const enabledLinks = getEnabledLinks(config);
  const name = config?.name?.trim() || "Profile";
  const headline = config?.headline?.trim() || "";
  const badges = (Array.isArray(config?.badges) ? config.badges : [])
    .map((b) => (typeof b === "string" ? b.trim() : b?.label?.trim() || ""))
    .filter(Boolean);
  const location = config?.location?.trim() || "";
  const description = config?.description?.trim() || "";
  const knowsAbout = Array.isArray(config?.seo?.knowsAbout)
    ? config.seo.knowsAbout.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const summaryParts = [headline, ...badges].filter(Boolean).join(" • ");
  const lines = [
    `# ${name}`,
    "",
    `> ${summaryParts}${location ? ` — based in ${location}.` : "."}`,
    "",
  ];

  if (description) {
    lines.push(description, "");
  }

  lines.push("## Overview", "");
  lines.push(`- **Name**: ${name}`);
  if (headline) lines.push(`- **Role**: ${headline}`);
  if (badges.length > 0) lines.push(`- **Credentials**: ${badges.join(", ")}`);
  if (location) lines.push(`- **Location**: ${location}`);
  if (knowsAbout.length > 0) {
    lines.push(`- **Focus Areas**: ${knowsAbout.join(", ")}`);
  }
  lines.push(`- **Canonical Profile**: ${canonicalUrl}`);
  lines.push("");

  if (enabledLinks.length > 0) {
    lines.push("## Official Profiles & Social Links", "");
    for (const link of enabledLinks) {
      const suffix = link.description ? `: ${link.description}` : "";
      lines.push(`- [${link.label}](${link.url})${suffix}`);
    }
    lines.push("");
  }

  const repoUrl = validateExternalUrl(config?.footer?.repoUrl);
  if (repoUrl) {
    lines.push("## Source Repository", "");
    lines.push(`- [${config?.footer?.repoLabel?.trim() || "GitHub Repository"}](${repoUrl}): Open-source personal landing page powering ${canonicalUrl}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildSitemapXml(config) {
  const canonicalUrl = getCanonicalUrl(config);
  const llmsUrl = new URL("./llms.txt", canonicalUrl).href;

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(canonicalUrl)}</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${escapeXml(llmsUrl)}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>
`;
}

function buildRobotsTxt(config) {
  const canonicalUrl = getCanonicalUrl(config);
  const sitemapUrl = new URL("./sitemap.xml", canonicalUrl).href;

  return `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;
}

const checkMode = process.argv.includes("--check");
const targets = [
  { relPath: "index.html", content: buildIndexHtml(profile) },
  { relPath: "llms.txt", content: buildLlmsTxt(profile) },
  { relPath: "sitemap.xml", content: buildSitemapXml(profile) },
  { relPath: "robots.txt", content: buildRobotsTxt(profile) },
];

let drifted = false;
for (const { relPath, content } of targets) {
  const absPath = path.join(ROOT_DIR, relPath);
  const current = fs.existsSync(absPath)
    ? fs.readFileSync(absPath, "utf8")
    : null;
  if (checkMode) {
    if (current !== content) {
      console.error(`Out of sync: ${relPath}`);
      drifted = true;
    }
  } else {
    fs.writeFileSync(absPath, content, "utf8");
    console.log(`Synced ${relPath}`);
  }
}

if (checkMode && drifted) {
  process.exit(1);
}
