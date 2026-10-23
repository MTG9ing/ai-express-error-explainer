import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ai-express-error-explainer',
  description:
    'Express error middleware that explains what just broke in plain English, using any OpenAI-compatible AI.',
  base: '/ai-express-error-explainer/',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#7c3aed' }],
    ['meta', { property: 'og:type', content: 'website' }],
    [
      'meta',
      {
        property: 'og:title',
        content: 'ai-express-error-explainer — plain-English error explanations for Express',
      },
    ],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Drop-in Express error middleware that asks an OpenAI-compatible AI what just broke: likely cause plus the next step to fix it.',
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'API', link: '/api/', activeMatch: '/api/' },
      {
        text: 'v0.1.0',
        link: 'https://github.com/MTG9ing/ai-express-error-explainer/releases',
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'How it works', link: '/guide/how-it-works' },
            { text: 'Recipes', link: '/guide/recipes' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API',
          items: [{ text: 'aiErrorExplainer()', link: '/api/' }],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/MTG9ing/ai-express-error-explainer' },
    ],
    search: {
      provider: 'local',
    },
    editLink: {
      pattern: 'https://github.com/MTG9ing/ai-express-error-explainer/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Zero runtime dependencies · Works with any OpenAI-compatible API',
      copyright: 'MIT License · Copyright © 2026 MTG9ing',
    },
    outline: {
      level: [2, 3],
    },
    externalLinkIcon: true,
  },
})
