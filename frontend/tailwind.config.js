/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-space-grotesk)', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', 'Fira Code', 'Consolas', 'monospace'],
        display: ['var(--font-space-grotesk)', 'sans-serif'],
      },
      colors: {
        cricket: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
      },
      animation: {
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow':          'glow 2s ease-in-out infinite alternate',
        'glow-green':    'glow-green 2s ease-in-out infinite alternate',
        'spin-slow':     'spin 8s linear infinite',
        'float':         'float 4s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%':   { boxShadow: '0 0 5px rgba(251, 191, 36, 0.2)' },
          '100%': { boxShadow: '0 0 24px rgba(251, 191, 36, 0.5)' },
        },
        'glow-green': {
          '0%':   { boxShadow: '0 0 5px rgba(52, 211, 153, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(52, 211, 153, 0.45)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
      },
      ringWidth: {
        '3': '3px',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
