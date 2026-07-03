import { defineConfig, presetWind4, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig({
  presets: [
    presetWind4(),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  theme: {
    colors: {
      border: 'var(--border)',
      input: 'var(--input)',
      ring: 'var(--ring)',
      background: 'var(--background)',
      foreground: 'var(--foreground)',
      highlight: 'var(--highlight)',
      primary: {
        DEFAULT: 'var(--primary)',
        foreground: 'var(--primary-foreground)',
      },
      secondary: {
        DEFAULT: 'var(--secondary)',
        foreground: 'var(--secondary-foreground)',
      },
      destructive: {
        DEFAULT: 'var(--destructive)',
        foreground: 'var(--destructive-foreground)',
      },
      muted: {
        DEFAULT: 'var(--muted)',
        foreground: 'var(--muted-foreground)',
      },
      accent: {
        DEFAULT: 'var(--accent)',
        foreground: 'var(--accent-foreground)',
      },
      popover: {
        DEFAULT: 'var(--popover)',
        foreground: 'var(--popover-foreground)',
      },
      card: {
        DEFAULT: 'var(--card)',
        foreground: 'var(--card-foreground)',
      },
      ok: {
        DEFAULT: 'var(--ok)',
        foreground: 'var(--ok-foreground)',
      },
      warn: {
        DEFAULT: 'var(--warn)',
        foreground: 'var(--warn-foreground)',
      },
      error: {
        DEFAULT: 'var(--error)',
        foreground: 'var(--error-foreground)',
      },
    },

    radius: {
      DEFAULT: 'var(--radius)',
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
      full: '9999px',
    },

  },
  // Safelist any dynamic classes that might not be detected statically
  safelist: [
    'hidden',
    'sm:table-cell',
    'invert',
    'invert-0',
  ],
})
