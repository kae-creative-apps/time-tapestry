import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#faf6ef',
          50: '#fdfbf6',
          100: '#faf6ef',
          200: '#f3ebdb',
          300: '#e8dcc2'
        },
        ink: {
          DEFAULT: '#3a3a3a',
          400: '#6b6358',
          500: '#4a443c',
          600: '#3a3530',
          700: '#2a2520',
          800: '#1a1714'
        },
        oxblood: {
          DEFAULT: '#7a2e2e',
          400: '#9a4545',
          500: '#7a2e2e',
          600: '#5c2222',
          700: '#3d1717'
        },
        forest: {
          DEFAULT: '#3d6b4e',
          500: '#4a7d5c',
          600: '#3d6b4e',
          700: '#2d5239'
        },
        warmgray: {
          200: '#e5ddd0',
          300: '#d4ccc0',
          400: '#a89e8e',
          500: '#8a7e6e',
          600: '#6d6356'
        }
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', '-apple-system', 'sans-serif']
      },
      fontSize: {
        story: ['1.125rem', { lineHeight: '1.7' }],
        quote: ['1.25rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }]
      },
      boxShadow: {
        soft: '0 1px 2px rgba(58, 58, 58, 0.04), 0 8px 24px rgba(58, 58, 58, 0.06)',
        lift: '0 1px 2px rgba(58, 58, 58, 0.04), 0 12px 32px rgba(58, 58, 58, 0.08)'
      },
      transitionTimingFunction: {
        ease: 'ease'
      }
    }
  },
  plugins: []
};

export default config;
