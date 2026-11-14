/**
 * Single source of truth for your personal Link-in-Bio website.
 *
 * Customize your profile, badges, contact actions, social links, custom links,
 * and footer below without editing HTML, CSS, or application logic.
 * (Optional: run `node scripts/sync-static.mjs` after editing to also update
 * static No-JS HTML fallbacks, JSON-LD, `llms.txt`, and `sitemap.xml`.)
 *
 * Rules for links:
 * - Only links with `enabled: true` and a valid `https://` URL are rendered.
 * - Reorder items in `links` to change their display order on the page.
 * - Drop any `<name>.svg` file into `assets/icons/` and reference `icon: "<name>"`
 *   (if omitted or not found, it automatically falls back to `globe.svg`).
 */
export const profile = {
  name: "Enes Turan",

  headline: "Software Engineer at JumpCloud",

  canonicalUrl: "https://devenes.github.io/turan-dock/",

  badges: [
    {
      label: "Google Developer Expert",
      icon: "sparkle",
    },
  ],

  location: "Istanbul, Türkiye",

  description:
    "Building scalable software systems, cloud architecture, and practical AI solutions.",

  avatar: {
    src: "./assets/images/profile.webp",
    alt: "Enes Turan speaking on stage",
  },

  contact: {
    // Split into `user` + `domain` so spam harvesters never find a raw email address in source files
    email: {
      user: "ahmedenesturan",
      domain: "gmail.com",
    },
    organization: "JumpCloud",
    jobTitle: "Software Engineer",
    vcardFilename: "enes-turan.vcf",
    enableQrModal: true,
    enableVcard: true,
    enableCopyEmail: true,
  },

  seo: {
    title: "Enes Turan — Software Engineer & Google Developer Expert",
    description:
      "Official personal profile and social links of Enes Turan — Software Engineer at JumpCloud and Google Developer Expert based in Istanbul, Türkiye.",
    knowsAbout: [
      "Software Engineering",
      "Cloud Architecture",
      "Distributed Systems",
      "Artificial Intelligence",
      "Platform Engineering",
    ],
  },

  links: [
    {
      id: "linkedin",
      label: "LinkedIn",
      url: "https://www.linkedin.com/in/devenes/",
      icon: "linkedin",
      description: "Connect with me professionally",
      enabled: true,
    },
    {
      id: "github",
      label: "GitHub",
      url: "https://github.com/devenes",
      icon: "github",
      description: "Explore my open-source projects & code",
      enabled: true,
    },
    {
      id: "x",
      label: "X (Twitter)",
      url: "https://x.com/thedevenes",
      icon: "x",
      description: "Thoughts on Cloud, Software Engineering & AI",
      enabled: true,
    },
    {
      id: "instagram",
      label: "Instagram",
      url: "https://www.instagram.com/enes.ai/",
      icon: "instagram",
      description: "AI insights, community events & daily moments",
      enabled: true,
    },
    {
      id: "facebook",
      label: "Facebook",
      url: "https://www.facebook.com/profile.php?id=100087441315629",
      icon: "facebook",
      description: "Personal updates & community highlights",
      enabled: true,
    },
    {
      id: "youtube",
      label: "YouTube",
      url: "YOUR_YOUTUBE_URL",
      icon: "youtube",
      description: "Tech talks, demos & deep dives",
      enabled: false,
    },
  ],

  footer: {
    text: "Designed & built by Enes Turan",
    repoLabel: "Open Source on GitHub",
    repoUrl: "https://github.com/devenes/turan-dock",
  },
};
