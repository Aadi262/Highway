import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#09090B',
        surface: '#18181B',
        border: '#27272A',
        muted: '#3F3F46',
        'muted-foreground': '#A1A1AA',
        foreground: '#FAFAFA',
        'foreground-secondary': '#A1A1AA',
        accent: {
          DEFAULT: '#22C55E',
          foreground: '#052E16',
        },
        danger: {
          DEFAULT: '#EF4444',
          foreground: '#FFF',
        },
        warning: {
          DEFAULT: '#F59E0B',
          foreground: '#000',
        },
        primary: {
          DEFAULT: '#FAFAFA',
          foreground: '#18181B',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '8px',
        xl: '12px',
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.2s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
