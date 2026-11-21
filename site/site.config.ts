// Per-repo config for the shared docs-theme (repo standards §7).

interface SocialLink {
  kind: 'github' | 'linkedin';
  label: string;
  href: string;
}

export const siteConfig = {
  projectName: 'Image Forge',
  description:
    'Bulk AI image generation from a sentence or a spreadsheet, using your own API keys. Free to run, no account, keys stay on your machine.',
  repoUrl: 'https://github.com/Stravelakis/image-forge',
  faviconHref: '/image-forge/favicon.svg',

  seoTitle: 'Image Forge — bulk AI images from one sentence, free, your own keys',
  socialImage: 'og-image.png',
  socialImageAlt:
    'Image Forge: describe it once, say how many, get a folder of named pictures. Shows the Start screen with four generated potion-shop pictures.',
  locale: 'en_GB',

  // First visit lands on English; a reader's saved choice still wins.
  defaultVernacular: 'plain',

  // Left menu, top group. The "On this page" group below it is built from the
  // headings of the reading level on screen.
  nav: [
    { id: 'top', label: 'Overview' },
    { id: 'features', label: 'What it does' },
    { id: 'showcase', label: 'Screenshots' },
  ],

  // Buttons and chips in the hero.
  heroLinks: [
    { label: 'Download for Windows', href: 'https://github.com/Stravelakis/image-forge/releases/latest', primary: true },
    { label: 'Source on GitHub', href: 'https://github.com/Stravelakis/image-forge' },
    { label: 'What changed', href: 'https://github.com/Stravelakis/image-forge/blob/master/CHANGELOG.md' },
  ],
  heroPills: ['Free first', 'No account', 'Keys stay on your PC', 'Never spends without asking'],

  // The three cards under the hero. They switch the reading level.
  levelCards: [
    { id: 'dev', tag: 'Dev', title: 'How it is built', text: 'Architecture, data flow, the engine layer, the agent API, build, test and release.' },
    { id: 'plain', tag: 'English', title: 'How to use it', text: 'For people who are comfortable with tech but do not write code. Setup, daily use, money, fixes.' },
    { id: 'eli5', tag: 'ELI5', title: 'Start from zero', text: 'Slow and complete. Every word explained, every click spelled out, from "what is this" to your first pictures.' },
  ],

  vernaculars: [
    { id: 'dev', label: 'Dev' },
    { id: 'plain', label: 'English' },
    { id: 'eli5', label: 'ELI5' },
  ],

  // Image Forge is a desktop app that calls paid and keyed image services; a
  // browser sandbox cannot run it honestly. The docs walk through it with real
  // screenshots instead — never a fake "run" button.
  playground: {
    enabled: false,
    starterCode: '',
  },

  author: {
    name: 'Stravelakis',
    links: [
      { kind: 'github', label: 'GitHub', href: 'https://github.com/Stravelakis' },
      { kind: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/stravelakiscom/' },
    ] as SocialLink[],
  },
};
