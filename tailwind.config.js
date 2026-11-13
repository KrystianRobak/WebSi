/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#07090b',
          900: '#0b0d10',
          850: '#0f1216',
          800: '#12151a',
          750: '#171b22',
          700: '#1d222b',
          600: '#272e3a',
        },
        gold: {
          50: '#fcf8ec',
          100: '#f7ecc9',
          200: '#eed88f',
          300: '#e5be58',
          400: '#d4a853',
          500: '#eab308',
          600: '#b38732',
          700: '#8a6522',
          800: '#654918',
          900: '#453210',
        },
        crimson: {
          950: '#2a0c10',
          900: '#451218',
          500: '#dc2626',
          400: '#f87171',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Cinzel', 'Cormorant Garamond', 'Georgia', 'serif'],
        display: ['Cormorant Garamond', 'Cinzel', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'gold-glow': '0 0 18px rgba(212, 168, 83, 0.25)',
        'gold-sm': '0 0 8px rgba(212, 168, 83, 0.2)',
        'glass': '0 12px 32px rgba(0, 0, 0, 0.65)',
      },
    },
  },
  plugins: [],
};
