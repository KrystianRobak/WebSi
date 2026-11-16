/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#040507',
          900: '#06080b',
          850: '#090b0f',
          800: '#0c0f14',
          750: '#10141b',
          700: '#151a23',
          600: '#1e2430',
        },
        gold: {
          50: '#f5efe2',
          100: '#e6d7b4',
          200: '#d4b87d',
          300: '#c49a45',
          400: '#b68d40',
          500: '#a37b30',
          600: '#8a6522',
          700: '#6c4e1a',
          800: '#4e3812',
          900: '#33240b',
        },
        crimson: {
          950: '#1c080b',
          900: '#330d12',
          500: '#b91c1c',
          400: '#dc6b6b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Cinzel', 'Cormorant Garamond', 'Georgia', 'serif'],
        display: ['Cormorant Garamond', 'Cinzel', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'gold-glow': '0 0 18px rgba(182, 141, 64, 0.2)',
        'gold-sm': '0 0 8px rgba(182, 141, 64, 0.16)',
        'glass': '0 14px 36px rgba(0, 0, 0, 0.78)',
      },
    },
  },
  plugins: [],
};
