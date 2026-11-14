import { profile } from "../../config/profile.js";
import { createQrSvgElement } from "./qrcode.js";

const DEFAULT_ICON_PATH = "./assets/icons/globe.svg";
const ARROW_ICON_PATH = "./assets/icons/external-link.svg";
const LOCATION_ICON_PATH = "./assets/icons/map-pin.svg";
const SAFE_ICON_NAME_RE = /^[a-z0-9-]+$/i;
const SAFE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let activeConfig = profile;
let uiInitialized = false;
let lastAnnouncement = "";
let supportsDisplayTransition;
const feedbackTimers = new WeakMap();

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
 * Assembles an email address at runtime from `{ user, domain }` or plain string.
 * Prevents exposing a raw email link or plain address to static HTML scrapers.
 *
 * @param {unknown} emailConfig
 * @returns {string | null}
 */
export function resolveEmailAddress(emailConfig) {
  let candidate = "";
  if (typeof emailConfig === "string") {
    candidate = emailConfig.trim();
  } else if (emailConfig && typeof emailConfig === "object") {
    const user =
      typeof emailConfig.user === "string" ? emailConfig.user.trim() : "";
    const domain =
      typeof emailConfig.domain === "string" ? emailConfig.domain.trim() : "";
    if (user && domain) {
      candidate = `${user}@${domain}`;
    }
  }

  if (!candidate || /^YOUR_/i.test(candidate) || !SAFE_EMAIL_RE.test(candidate)) {
    return null;
  }
  return candidate;
}

/**
 * Resolves the canonical share URL for QR code & Web Share actions.
 *
 * @param {typeof profile} config
 * @returns {string}
 */
export function resolveShareUrl(config) {
  const configured = validateExternalUrl(config?.canonicalUrl);
  if (configured) {
    return configured;
  }
  if (typeof window !== "undefined" && window.location?.href) {
    const live = validateExternalUrl(window.location.href);
    if (live) {
      return live;
    }
  }
  return "https://devenes.github.io/turan-dock/";
}

/**
 * Formats an HTTPS URL into a compact human-readable label (e.g. `devenes.github.io/turan-dock`).
 *
 * @param {string} url
 * @returns {string}
 */
function formatDisplayUrl(url) {
  try {
    const parsed = new URL(url);
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.host}${cleanPath}`;
  } catch {
    return url;
  }
}

/**
 * Escapes special characters per RFC 2426 / vCard 3.0.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeVcardValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Generates a universal vCard 3.0 (`.vcf`) payload from `config/profile.js`.
 *
 * @param {typeof profile} config
 * @returns {string}
 */
export function generateVcardString(config) {
  const fullName =
    typeof config?.name === "string" && config.name.trim()
      ? config.name.trim()
      : "Contact";
  const parts = fullName.split(/\s+/);
  const familyName = parts.length > 1 ? parts[parts.length - 1] : "";
  const givenName =
    parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "";

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVcardValue(familyName)};${escapeVcardValue(givenName)};;;`,
    `FN:${escapeVcardValue(fullName)}`,
  ];

  const org =
    typeof config?.contact?.organization === "string"
      ? config.contact.organization.trim()
      : "";
  if (org) {
    lines.push(`ORG:${escapeVcardValue(org)}`);
  }

  const jobTitle =
    typeof config?.contact?.jobTitle === "string" &&
    config.contact.jobTitle.trim()
      ? config.contact.jobTitle.trim()
      : typeof config?.headline === "string"
        ? config.headline.trim()
        : "";
  if (jobTitle) {
    lines.push(`TITLE:${escapeVcardValue(jobTitle)}`);
  }

  const badgeLabels = Array.isArray(config?.badges)
    ? config.badges
        .map((b) => (typeof b === "string" ? b.trim() : b?.label?.trim() || ""))
        .filter(Boolean)
    : [];
  if (badgeLabels.length > 0) {
    lines.push(`ROLE:${escapeVcardValue(badgeLabels.join(", "))}`);
  }

  const email = resolveEmailAddress(config?.contact?.email);
  if (email) {
    lines.push(`EMAIL;TYPE=INTERNET,PREF:${email}`);
  }

  const location =
    typeof config?.location === "string" ? config.location.trim() : "";
  if (location) {
    const locParts = location.split(",").map((s) => s.trim());
    const city = locParts[0] || "";
    const country = locParts.slice(1).join(", ");
    lines.push(
      `ADR;TYPE=WORK:;;${escapeVcardValue(city)};;;;${escapeVcardValue(country)}`
    );
  }

  const shareUrl = resolveShareUrl(config);
  if (shareUrl) {
    lines.push(`URL:${shareUrl}`);
  }

  const description =
    typeof config?.description === "string" ? config.description.trim() : "";
  if (description) {
    lines.push(`NOTE:${escapeVcardValue(description)}`);
  }

  const links = Array.isArray(config?.links) ? config.links : [];
  let itemIdx = 1;
  for (const link of links) {
    if (!link || link.enabled === false) {
      continue;
    }
    const safeUrl = validateExternalUrl(link.url);
    const label = typeof link.label === "string" ? link.label.trim() : "";
    if (!safeUrl || !label) {
      continue;
    }
    lines.push(`item${itemIdx}.URL:${safeUrl}`);
    lines.push(`item${itemIdx}.X-ABLabel:${escapeVcardValue(label)}`);
    itemIdx++;
  }

  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Triggers a client-side file download from an in-memory Blob.
 *
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
function triggerBlobDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
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
 * Probes whether the browser genuinely transitions discrete `display` changes
 * (guards against Firefox bug 1882408 where CSS.supports returns true prematurely).
 *
 * @returns {boolean}
 */
function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) {
    return supportsDisplayTransition;
  }
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition = getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("overlay", "auto")) &&
    canTransitionDisplay()
  );
}

/**
 * Closes a `<dialog>` or `[popover]` smoothly, waiting for exit animations
 * in browsers that lack `overlay` + discrete `display` transition support.
 *
 * @param {HTMLElement} element
 * @param {boolean} [isPopover=false]
 */
async function closeTopLayer(element, isPopover = false) {
  if (!element) {
    return;
  }
  if (!supportsTopLayerExit()) {
    if (element.hasAttribute("data-closing")) {
      return;
    }
    element.setAttribute("data-closing", "");
    const animations =
      typeof element.getAnimations === "function"
        ? element.getAnimations({ subtree: true })
        : [];
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
    }
    if (!element.hasAttribute("data-closing")) {
      return;
    }
    element.removeAttribute("data-closing");
  }

  if (isPopover) {
    if (typeof element.hidePopover === "function") {
      try {
        element.hidePopover();
      } catch {
        // Already hidden
      }
    } else {
      element.classList.remove("is-fallback-open");
    }
  } else if (typeof element.close === "function" && element.open) {
    element.close();
  }
}

/**
 * Announces a status string to assistive technologies with VoiceOver repeat deduping.
 *
 * @param {string} rawMessage
 */
function announceMessage(rawMessage) {
  let message = rawMessage;
  if (message === lastAnnouncement) {
    message += "\u00A0";
  }
  lastAnnouncement = message;

  if (typeof document.ariaNotify === "function") {
    document.ariaNotify(rawMessage);
    return;
  }

  const announcer = document.getElementById("sr-announcer");
  if (announcer) {
    announcer.textContent = "";
    requestAnimationFrame(() => {
      announcer.textContent = message;
    });
  }
}

/**
 * Displays a non-intrusive `popover="manual"` toast notification in `#toast-region`.
 * Suppressed automatically if a modal `<dialog>` is open so background inert regions aren't used.
 *
 * @param {string} message
 * @param {{ variant?: "success" | "error", triggerEl?: HTMLElement | null }} [options]
 */
function showToast(message, options = {}) {
  if (typeof document === "undefined") {
    return;
  }
  // Never surface background toasts while a modal dialog is open
  if (document.querySelector("dialog:modal")) {
    return;
  }

  const region = document.getElementById("toast-region");
  if (!region) {
    return;
  }

  const variant = options.variant === "error" ? "error" : "success";
  const triggerEl = options.triggerEl || null;

  // Keep stack tidy (max 2 visible toasts at once)
  const existing = [...region.querySelectorAll(".toast")];
  if (existing.length >= 2) {
    existing[0].remove();
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${variant}`;
  toast.setAttribute("popover", "manual");

  const iconPath =
    variant === "error" ? "./assets/icons/close.svg" : "./assets/icons/check.svg";
  const icon = createDecorativeIcon(iconPath, "toast-icon", 18);

  const textEl = document.createElement("span");
  textEl.className = "toast-text";
  textEl.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.appendChild(
    createDecorativeIcon("./assets/icons/close.svg", "toast-close-icon", 15)
  );

  toast.append(icon, textEl, closeBtn);
  region.appendChild(toast);

  if (typeof toast.showPopover === "function") {
    try {
      toast.showPopover();
    } catch {
      toast.classList.add("is-fallback-open");
    }
  } else {
    toast.classList.add("is-fallback-open");
  }

  announceMessage(message);

  let timerId = null;
  let dismissed = false;

  const dismiss = async (manualFocusRestore = false) => {
    if (dismissed) {
      return;
    }
    dismissed = true;
    clearTimeout(timerId);

    const hadFocus = toast.contains(document.activeElement);
    await closeTopLayer(toast, true);
    const nextToastClose = region
      .querySelector(".toast:not([data-closing]) .toast-close");
    toast.remove();

    if (manualFocusRestore && hadFocus) {
      if (nextToastClose instanceof HTMLElement) {
        nextToastClose.focus();
      } else if (triggerEl && triggerEl.isConnected) {
        triggerEl.focus();
      }
    }
  };

  const scheduleAutoDismiss = () => {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      if (toast.matches(":focus-within, :hover")) {
        return;
      }
      dismiss(false);
    }, 4000);
  };

  closeBtn.addEventListener("click", () => dismiss(true));
  toast.addEventListener("focusin", () => clearTimeout(timerId));
  toast.addEventListener("focusout", () => {
    if (!toast.contains(document.activeElement)) {
      scheduleAutoDismiss();
    }
  });
  toast.addEventListener("pointerenter", () => clearTimeout(timerId));
  toast.addEventListener("pointerleave", scheduleAutoDismiss);

  scheduleAutoDismiss();
}

/**
 * Legacy synchronous clipboard fallback for restricted non-HTTPS contexts.
 *
 * @param {string} text
 * @returns {boolean}
 */
function legacyCopy(text) {
  const field = Object.assign(document.createElement("textarea"), {
    value: text,
  });
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;inset-block-start:0;opacity:0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } finally {
    field.remove();
  }
}

/**
 * Updates inline button state & optional adjacent `[role="status"]` bubble after copy.
 *
 * @param {HTMLElement} button
 * @param {boolean} ok
 * @param {string} bubbleMessage
 */
function reportButtonCopyState(button, ok, bubbleMessage) {
  const tip =
    button.nextElementSibling?.getAttribute("role") === "status"
      ? button.nextElementSibling
      : null;
  const labelEl = button.querySelector("[data-default-label]");

  clearTimeout(feedbackTimers.get(button));
  button.removeAttribute("data-copied");
  button.removeAttribute("data-failed");

  if (tip) {
    tip.textContent = "";
    tip.removeAttribute("data-visible");
  }

  void button.offsetWidth;
  button.setAttribute(ok ? "data-copied" : "data-failed", "");

  if (labelEl) {
    const nextLabel = ok
      ? labelEl.getAttribute("data-copied-label")
      : labelEl.getAttribute("data-failed-label");
    if (nextLabel) {
      labelEl.textContent = nextLabel;
    }
  }

  if (tip) {
    let announced = bubbleMessage;
    if (announced === lastAnnouncement) {
      announced += "\u00A0";
    }
    lastAnnouncement = announced;
    tip.setAttribute("data-visible", "");
    requestAnimationFrame(() => {
      tip.textContent = announced;
    });
  }

  feedbackTimers.set(
    button,
    setTimeout(() => {
      button.removeAttribute("data-copied");
      button.removeAttribute("data-failed");
      if (labelEl) {
        const defaultLabel = labelEl.getAttribute("data-default-label");
        if (defaultLabel) {
          labelEl.textContent = defaultLabel;
        }
      }
      if (tip) {
        tip.removeAttribute("data-visible");
        tip.textContent = "";
      }
    }, 2400)
  );
}

/**
 * Copies text for `--copy` (URL/element) or `--copy-email` (obfuscated config email).
 *
 * @param {HTMLElement} button
 * @param {HTMLElement | null} target
 * @param {string} command
 */
async function executeCopyCommand(button, target, command) {
  let text = "";
  if (command === "--copy-email") {
    text = resolveEmailAddress(activeConfig?.contact?.email) || "";
  } else if (target) {
    text = target.matches("input, textarea")
      ? target.value.trim()
      : target.innerText.trim();
  }

  if (!text) {
    return;
  }

  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    ok = legacyCopy(text);
  }

  if (command === "--copy-email") {
    reportButtonCopyState(
      button,
      ok,
      ok ? "Copied" : "Copy failed"
    );
    showToast(
      ok ? `Email copied (${text})` : "Could not copy email address",
      { variant: ok ? "success" : "error", triggerEl: button }
    );
  } else {
    reportButtonCopyState(
      button,
      ok,
      ok ? "Link copied" : "Copy failed"
    );
  }
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
 * Configures Quick Actions (QR Modal, Save Contact vCard, Copy Email) and mounts QR SVG.
 *
 * @param {typeof profile} config
 */
function renderQuickActionsAndModal(config) {
  const actionsBar = document.getElementById("quick-actions");
  const openQrBtn = document.getElementById("open-qr-btn");
  const saveVcardBtn = document.getElementById("save-vcard-btn");
  const copyEmailBtn = document.getElementById("copy-email-btn");
  const qrDialog = document.getElementById("qr-dialog");
  const qrMount = document.getElementById("qr-code-mount");
  const qrUrlDisplay = document.getElementById("qr-url-display");
  const shareUrlInput = document.getElementById("share-url-source");
  const nativeShareBtn = document.getElementById("modal-native-share-btn");

  const enableQr = config?.contact?.enableQrModal !== false && Boolean(qrDialog);
  const enableVcard = config?.contact?.enableVcard !== false;
  const email = resolveEmailAddress(config?.contact?.email);
  const enableEmail = config?.contact?.enableCopyEmail !== false && Boolean(email);

  if (openQrBtn) {
    openQrBtn.hidden = !enableQr;
  }
  if (saveVcardBtn) {
    saveVcardBtn.hidden = !enableVcard;
  }
  if (copyEmailBtn) {
    copyEmailBtn.hidden = !enableEmail;
  }
  if (actionsBar) {
    actionsBar.hidden = !(enableQr || enableVcard || enableEmail);
  }

  const shareUrl = resolveShareUrl(config);
  if (shareUrlInput && "value" in shareUrlInput) {
    shareUrlInput.value = shareUrl;
  }
  if (qrUrlDisplay) {
    qrUrlDisplay.textContent = formatDisplayUrl(shareUrl);
  }
  if (qrMount && enableQr) {
    qrMount.replaceChildren();
    const displayName =
      typeof config?.name === "string" && config.name.trim()
        ? config.name.trim()
        : "Profile";
    qrMount.appendChild(
      createQrSvgElement(shareUrl, {
        label: `QR code for ${displayName}'s profile (${formatDisplayUrl(shareUrl)})`,
      })
    );
  }

  if (nativeShareBtn) {
    nativeShareBtn.hidden =
      typeof navigator === "undefined" || typeof navigator.share !== "function";
  }
}

/**
 * Wires interactive listeners once (QR dialog light-dismiss/close fallbacks, vCard, Web Share, Copy).
 */
function setupInteractiveHandlers() {
  if (uiInitialized || typeof document === "undefined") {
    return;
  }
  uiInitialized = true;

  const qrDialog = document.getElementById("qr-dialog");
  const closeQrBtn = document.getElementById("close-qr-btn");
  const saveVcardBtn = document.getElementById("save-vcard-btn");
  const nativeShareBtn = document.getElementById("modal-native-share-btn");
  const downloadQrBtn = document.getElementById("modal-download-qr-btn");

  // 1. Invoker Commands (`command` / `commandfor`) capture listener + fallback
  document.addEventListener(
    "command",
    (event) => {
      if (typeof event.command === "string" && event.command.startsWith("--copy")) {
        executeCopyCommand(event.source, event.target, event.command);
      }
    },
    true
  );

  if (typeof window !== "undefined" && !("CommandEvent" in window)) {
    document.addEventListener("click", (event) => {
      const targetEl = event.target instanceof Element ? event.target : null;
      if (!targetEl) {
        return;
      }
      const copyBtn = targetEl.closest('button[command^="--copy"]');
      if (copyBtn instanceof HTMLElement) {
        const cmd = copyBtn.getAttribute("command") || "--copy";
        const refId = copyBtn.getAttribute("commandfor");
        const refEl = refId ? document.getElementById(refId) : null;
        executeCopyCommand(copyBtn, refEl, cmd);
        return;
      }
    });
  }

  if (
    typeof HTMLButtonElement !== "undefined" &&
    !("commandForElement" in HTMLButtonElement.prototype)
  ) {
    document.addEventListener("click", (event) => {
      const targetEl = event.target instanceof Element ? event.target : null;
      const cmdBtn = targetEl?.closest("button[command][commandfor]");
      if (!(cmdBtn instanceof HTMLButtonElement)) {
        return;
      }
      const cmd = cmdBtn.getAttribute("command");
      const targetId = cmdBtn.getAttribute("commandfor");
      const dialogTarget = targetId ? document.getElementById(targetId) : null;
      if (!(dialogTarget instanceof HTMLDialogElement)) {
        return;
      }
      if (cmd === "show-modal" && !dialogTarget.open) {
        dialogTarget.showModal();
      } else if (cmd === "close" && dialogTarget.open) {
        closeTopLayer(dialogTarget);
      }
    });
  }

  // 2. Dialog close animation & Safari/legacy `closedby="any"` light-dismiss fallback
  if (qrDialog instanceof HTMLDialogElement) {
    qrDialog.addEventListener("cancel", (event) => {
      if (!supportsTopLayerExit()) {
        event.preventDefault();
        closeTopLayer(qrDialog);
      }
    });

    qrDialog.addEventListener("close", () => {
      qrDialog.returnValue = "";
      qrDialog.removeAttribute("data-closing");
    });

    if (closeQrBtn) {
      closeQrBtn.addEventListener("click", (event) => {
        if (!supportsTopLayerExit() && qrDialog.open) {
          event.preventDefault();
          closeTopLayer(qrDialog);
        }
      });
    }

    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const isOutside = (e, dlg) => {
        const rect = dlg.getBoundingClientRect();
        return (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        );
      };
      let pressedOutside = false;
      qrDialog.addEventListener("pointerdown", (e) => {
        pressedOutside = e.target === qrDialog && isOutside(e, qrDialog);
      });
      qrDialog.addEventListener("pointerup", (e) => {
        if (pressedOutside && e.target === qrDialog && isOutside(e, qrDialog)) {
          closeTopLayer(qrDialog);
        }
        pressedOutside = false;
      });
    }
  }

  // 3. vCard (.vcf) contact download
  if (saveVcardBtn) {
    saveVcardBtn.addEventListener("click", () => {
      const vcf = generateVcardString(activeConfig);
      const rawFilename =
        typeof activeConfig?.contact?.vcardFilename === "string" &&
        activeConfig.contact.vcardFilename.trim()
          ? activeConfig.contact.vcardFilename.trim()
          : "contact.vcf";
      const safeFilename = rawFilename.endsWith(".vcf")
        ? rawFilename
        : `${rawFilename}.vcf`;
      triggerBlobDownload(vcf, safeFilename, "text/vcard;charset=utf-8");
      showToast("Contact card (.vcf) downloaded", {
        variant: "success",
        triggerEl: saveVcardBtn,
      });
    });
  }

  // 4. Native Web Share API inside QR modal
  if (nativeShareBtn) {
    nativeShareBtn.addEventListener("click", async () => {
      if (typeof navigator.share !== "function") {
        return;
      }
      const shareUrl = resolveShareUrl(activeConfig);
      const title =
        activeConfig?.seo?.title?.trim() ||
        activeConfig?.name?.trim() ||
        document.title;
      const text =
        activeConfig?.headline?.trim() ||
        activeConfig?.description?.trim() ||
        "";
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch (err) {
        // Ignore user-initiated share sheet cancellation (AbortError)
        if (err && err.name !== "AbortError") {
          reportButtonCopyState(nativeShareBtn, false, "Share unavailable");
        }
      }
    });
  }

  // 5. Save standalone QR SVG from modal
  if (downloadQrBtn) {
    downloadQrBtn.addEventListener("click", () => {
      const svgEl = document.querySelector("#qr-code-mount svg");
      if (!svgEl) {
        return;
      }
      const serializer = new XMLSerializer();
      const source = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(svgEl)}`;
      triggerBlobDownload(source, "enes-turan-qr.svg", "image/svg+xml;charset=utf-8");
      reportButtonCopyState(downloadQrBtn, true, "QR saved");
    });
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
  activeConfig = config;
  renderMetadata(config);
  renderProfileHeader(config);
  renderQuickActionsAndModal(config);
  renderLinks(config);
  renderFooter(config);
  setupInteractiveHandlers();
}

if (typeof document !== "undefined") {
  renderApp(profile);
}
