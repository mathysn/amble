/** @type {import('tailwindcss').Config} */
// Amble's design foundations: warm paper, a soft sage accent, Spectral over
// Instrument Sans. Mirrored in src/theme.ts for SVG / non-className use.
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        paper: '#F5F1E8',
        'paper-raised': '#FFFCF5',
        sand: '#E9E2D2',
        'sand-deep': '#E4DCCB',
        sage: '#7A8B6F',
        'sage-dark': '#63735A',
        ink: '#2E2B26',
        'ink-strong': '#26241F',
      },
      fontFamily: {
        spectral: ['Spectral_400Regular'],
        'spectral-medium': ['Spectral_500Medium'],
        sans: ['InstrumentSans_400Regular'],
        'sans-medium': ['InstrumentSans_500Medium'],
        'sans-semibold': ['InstrumentSans_600SemiBold'],
        mono: ['ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        chip: '13px',
        card: '18px',
        panel: '20px',
        cta: '18px',
      },
    },
  },
  plugins: [],
};
