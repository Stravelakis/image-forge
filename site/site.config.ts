import type { DotFieldOptions } from './src/scripts/dot-field';

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

  nav: [
    { id: 'top', label: 'Overview' },
    { id: 'features', label: 'Features' },
    { id: 'showcase', label: 'Screenshots' },
    { id: 'docs', label: 'Docs' },
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

  backgrounds: {
    page: {
      cursorRadius: 200,
      bulgeStrength: 6,
      cursorForce: 0,
      dotRadius: 2,
      dotSpacing: 5,
      glowRadius: 50,
      sparkle: true,
      gradientFrom: '#0001c6',
      gradientTo: '#00cade',
      glowColor: '#040410',
    },
    sidebar: {
      cursorRadius: 100,
      bulgeStrength: 0,
      cursorForce: 0,
      bulgeOnly: false,
      dotSpacing: 5,
      glowRadius: 50,
      gradientFrom: '#0001c6',
      gradientTo: '#00cade',
      glowColor: '#040410',
    },
  } satisfies Record<string, DotFieldOptions>,
};
