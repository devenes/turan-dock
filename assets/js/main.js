import { profile } from "../../config/profile.js";

const DEFAULT_ICON_PATH = "./assets/icons/globe.svg";
const ARROW_ICON_PATH = "./assets/icons/external-link.svg";
const LOCATION_ICON_PATH = "./assets/icons/map-pin.svg";
const SAFE_ICON_NAME_RE = /^[a-z0-9-]+$/i;

/**
 * Validates external destination URLs before rendering clickable links.
 * Rejects placeholders, relative fragments, and non-HTTPS schemes (e.g. javascript:, data:, http:).
 *
 * @param {unknown} rawUrl
 * @returns {string | null}
 */
export function validateExternalUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed || /^YOUR_/i.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Validates a local relative image path (or explicit HTTPS image URL).
 *
 * @param {unknown} rawPath
 * @returns {string | null}
 */
export function validateImageSrc(rawPath) {
  if (typeof rawPath !== "string") {
    return null;
  }

  const trimmed = rawPath.trim();
  if (!trimmed) {
    return null;
  }

  if (
    (trimmed.startsWith("./") || trimmed.startsWith("assets/")) &&
    !trimmed.includes("..") &&
    !trimmed.startsWith("//")
  ) {
    return trimmed;
  }

  return validateExternalUrl(trimmed);
}

/**
 * Resolves an icon key from config to its local SVG file path safely.
 *
 * @param {unknown} iconKey
 * @returns {string}
 */
export function resolveIconPath(iconKey) {
  if (typeof iconKey === "string" && SAFE_ICON_NAME_RE.test(iconKey.trim())) {
    return `./assets/icons/${iconKey.trim().toLowerCase()}.svg`;
  }
  return DEFAULT_ICON_PATH;
}

/**
 * Creates a decorative `<img>` element hidden from assistive technologies,
 * falling back to `DEFAULT_ICON_PATH` if the target SVG file does not exist.
 *
 * @param {string} src
 * @param {string} className
 * @param {number} size
 * @returns {HTMLImageElement}
 */
function createDecorativeIcon(src, className, size) {
  const img = document.createElement("img");
  img.className = className;
  img.src = src;
  img.alt = "";
  img.width = size;
  img.height = size;
  img.decoding = "async";
  img.setAttribute("aria-hidden", "true");

  img.addEventListener(
    "error",
    () => {
      if (!img.src.endsWith("/globe.svg")) {
        img.src = DEFAULT_ICON_PATH;
      }
    },
    { once: true }
  );

  return img;
}

/**
 * Syncs document title and meta description if customized in `config/profile.js`.
 *
 * @param {typeof profile} config
 */
function renderMetadata(config) {
  const seoTitle = config?.seo?.title?.trim();
  const fallbackTitle = config?.name?.trim()
    ? config?.headline?.trim()
      ? `${config.name.trim()} — ${config.headline.trim()}`
      : config.name.trim()
    : "";

  if (seoTitle || fallbackTitle) {
    document.title = seoTitle || fallbackTitle;
  }

  const seoDescription = config?.seo?.description?.trim();
  if (seoDescription) {
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", seoDescription);
    }
  }
}

/**
 * Renders the profile header section safely using textContent and validated attributes.
 *
 * @param {typeof profile} config
 */
function renderProfileHeader(config) {
  const avatarFrame = document.getElementById("avatar-frame");
  const avatarImg = document.getElementById("profile-avatar");
  const nameEl = document.getElementById("profile-name");
  const headlineEl = document.getElementById("profile-headline");
  const badgesContainer = document.getElementById("profile-badges");
  const locationEl = document.getElementById("profile-location");
  const descriptionEl = document.getElementById("profile-description");

  // 1. Avatar (supports string path or { src, alt } object)
  if (avatarFrame && avatarImg) {
    const rawSrc =
      typeof config?.avatar === "string" ? config.avatar : config?.avatar?.src;
    const validSrc = validateImageSrc(rawSrc);

    if (validSrc) {
      const displayName =
        typeof config?.name === "string" && config.name.trim()
          ? config.name.trim()
          : "Profile";
      const altText =
        typeof config?.avatar === "object" &&
        typeof config.avatar?.alt === "string" &&
        config.avatar.alt.trim()
          ? config.avatar.alt.trim()
          : `${displayName} portrait`;

      avatarImg.src = validSrc;
      avatarImg.alt = altText;
      avatarFrame.hidden = false;
    } else {
      avatarFrame.hidden = true;
    }
  }

  // 2. Name
  if (nameEl) {
    const nameText =
      typeof config?.name === "string" ? config.name.trim() : "";
    nameEl.textContent = nameText;
    nameEl.hidden = !nameText;
  }

  // 3. Headline
  if (headlineEl) {
    const headlineText =
      typeof config?.headline === "string" ? config.headline.trim() : "";
    headlineEl.textContent = headlineText;
    headlineEl.hidden = !headlineText;
  }

  // 4. Optional credential badges
  if (badgesContainer) {
    badgesContainer.replaceChildren();
    const badges = Array.isArray(config?.badges) ? config.badges : [];
    const fragment = document.createDocumentFragment();

    for (const entry of badges) {
      const label =
        typeof entry === "string"
          ? entry.trim()
          : typeof entry?.label === "string"
            ? entry.label.trim()
            : "";

      if (!label) {
        continue;
      }

      const pill = document.createElement("span");
      pill.className = "badge-pill";

      const iconName =
        typeof entry === "object" && typeof entry?.icon === "string"
          ? entry.icon.trim()
          : "";
      if (iconName) {
        pill.appendChild(
          createDecorativeIcon(resolveIconPath(iconName), "badge-icon", 15)
        );
      }

      const textSpan = document.createElement("span");
      textSpan.textContent = label;
      pill.appendChild(textSpan);
      fragment.appendChild(pill);
    }

    badgesContainer.appendChild(fragment);
    badgesContainer.hidden = badgesContainer.childElementCount === 0;
  }

  // 5. Optional location
  if (locationEl) {
    locationEl.replaceChildren();
    const locationText =
      typeof config?.location === "string" ? config.location.trim() : "";

    if (locationText) {
      locationEl.appendChild(
        createDecorativeIcon(LOCATION_ICON_PATH, "location-icon", 15)
      );
      const textNode = document.createElement("span");
      textNode.textContent = locationText;
      locationEl.appendChild(textNode);
      locationEl.hidden = false;
    } else {
      locationEl.hidden = true;
    }
  }

  // 6. Optional introductory description
  if (descriptionEl) {
    const descText =
      typeof config?.description === "string" ? config.description.trim() : "";
    descriptionEl.textContent = descText;
    descriptionEl.hidden = !descText;
  }
}

/**
 * Renders enabled, validated links as semantic list items and native anchor elements.
 *
 * @param {typeof profile} config
 */
function renderLinks(config) {
  const listEl = document.getElementById("links-list");
  if (!listEl) {
    return;
  }

  listEl.replaceChildren();
  const links = Array.isArray(config?.links) ? config.links : [];
  const fragment = document.createDocumentFragment();

  for (const item of links) {
    if (!item || item.enabled === false) {
      continue;
    }

    const labelText =
      typeof item.label === "string" ? item.label.trim() : "";
    const safeUrl = validateExternalUrl(item.url);

    if (!labelText || !safeUrl) {
      continue;
    }

    const li = document.createElement("li");
    li.className = "links-item";

    const anchor = document.createElement("a");
    anchor.className = "link-card";
    anchor.href = safeUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";

    if (typeof item.id === "string" && SAFE_ICON_NAME_RE.test(item.id.trim())) {
      anchor.dataset.linkId = item.id.trim();
    }

    // Left platform icon
    const iconWrap = document.createElement("span");
    iconWrap.className = "link-icon-wrap";
    iconWrap.setAttribute("aria-hidden", "true");
    iconWrap.appendChild(
      createDecorativeIcon(resolveIconPath(item.icon), "link-icon", 20)
    );

    // Middle label + optional description
    const contentWrap = document.createElement("span");
    contentWrap.className = "link-content";

    const labelEl = document.createElement("span");
    labelEl.className = "link-label";
    labelEl.textContent = labelText;
    contentWrap.appendChild(labelEl);

    const descText =
      typeof item.description === "string" ? item.description.trim() : "";
    if (descText) {
      const descEl = document.createElement("span");
      descEl.className = "link-description";
      descEl.textContent = descText;
      contentWrap.appendChild(descEl);
    }

    // Right directional arrow
    const arrowWrap = document.createElement("span");
    arrowWrap.className = "link-arrow-wrap";
    arrowWrap.setAttribute("aria-hidden", "true");
    arrowWrap.appendChild(
      createDecorativeIcon(ARROW_ICON_PATH, "link-arrow", 18)
    );

    anchor.append(iconWrap, contentWrap, arrowWrap);
    li.appendChild(anchor);
    fragment.appendChild(li);
  }

  listEl.appendChild(fragment);

  if (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    !CSS.supports("animation-delay: calc(sibling-index() * 0.1s)")
  ) {
    [...listEl.children].forEach((el, index) => {
      el.style.setProperty("--sibling-index", String(index + 1));
    });
  }
}

/**
 * Renders the optional footer attribution and repository link.
 *
 * @param {typeof profile} config
 */
function renderFooter(config) {
  const footerEl = document.getElementById("site-footer");
  if (!footerEl) {
    return;
  }

  footerEl.replaceChildren();
  const footerConfig = config?.footer;
  if (!footerConfig || footerConfig.enabled === false) {
    footerEl.hidden = true;
    return;
  }

  const text =
    typeof footerConfig.text === "string" ? footerConfig.text.trim() : "";
  const repoUrl = validateExternalUrl(footerConfig.repoUrl);
  const repoLabel =
    typeof footerConfig.repoLabel === "string" && footerConfig.repoLabel.trim()
      ? footerConfig.repoLabel.trim()
      : "GitHub Repository";

  if (!text && !repoUrl) {
    footerEl.hidden = true;
    return;
  }

  const p = document.createElement("p");
  p.className = "footer-inner";

  if (text) {
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    p.appendChild(textSpan);
  }

  if (text && repoUrl) {
    const sep = document.createElement("span");
    sep.className = "footer-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "•";
    p.appendChild(sep);
  }

  if (repoUrl) {
    const repoLink = document.createElement("a");
    repoLink.className = "footer-link";
    repoLink.href = repoUrl;
    repoLink.target = "_blank";
    repoLink.rel = "noopener noreferrer";
    repoLink.textContent = repoLabel;
    p.appendChild(repoLink);
  }

  footerEl.appendChild(p);
  footerEl.hidden = false;
}

/**
 * Initializes the personal link-in-bio page from `config/profile.js`.
 *
 * @param {typeof profile} [config=profile]
 */
export function renderApp(config = profile) {
  renderMetadata(config);
  renderProfileHeader(config);
  renderLinks(config);
  renderFooter(config);
}

if (typeof document !== "undefined") {
  renderApp(profile);
}
