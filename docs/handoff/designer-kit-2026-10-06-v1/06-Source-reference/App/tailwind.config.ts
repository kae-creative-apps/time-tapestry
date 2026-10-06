import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#fbfaf8',
          50: '#ffffff',
          100: '#fbfaf8',
          200: '#f2f1ec',
          300: '#e6e5dd'
        },
        ink: {
          DEFAULT: '#432e23',
          400: '#726151',
          500: '#604d40',
          600: '#432e23',
          700: '#332219',
          800: '#251912'
        },
        oxblood: {
          DEFAULT: '#432e23',
          50: '#f5efea',
          400: '#755240',
          500: '#432e23',
          600: '#34231b',
          700: '#261911'
        },
        forest: {
          DEFAULT: '#535842',
          500: '#62684f',
          600: '#535842',
          700: '#404632'
        },
        warmgray: {
          200: '#e5e2db',
          300: '#ccc6bc',
          400: '#a29b8e',
          500: '#726151',
          600: '#645347'
        },
        espresso: {
          DEFAULT: '#432e23',
          400: '#755240',
          500: '#432e23',
          600: '#34231b',
          700: '#261911'
        },
        sage: {
          DEFAULT: '#939480',
          50: '#f4f4ef',
          100: '#eaece1',
          200: '#d9dbc9',
          300: '#bcc1a6',
          400: '#a4aa8d',
          500: '#939480',
          600: '#6c7157',
          700: '#535842'
        },
        clay: {
          DEFAULT: '#c18f7b',
          50: '#faf2ed',
          100: '#f1dfd5',
          300: '#d6af9c',
          400: '#c99c86',
          500: '#c18f7b',
          600: '#92664f',
          700: '#77503f'
        },
        taupe: {
          DEFAULT: '#756454',
          500: '#756454',
          600: '#645347'
        }
      },
      fontFamily: {
        // Legacy class alias lets all existing story screens share the new type.
        serif: ['var(--font-display)', 'Quicksand', 'sans-serif'],
        display: ['var(--font-display)', 'Quicksand', 'sans-serif'],
        sans: ['var(--font-inter)', '-apple-system', 'sans-serif']
      },
      borderRadius: {
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.75rem'
      },
      fontSize: {
        story: ['1.125rem', { lineHeight: '1.7' }],
        quote: ['1.25rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }]
      },
      boxShadow: {
        soft: '0 2px 8px rgba(67, 46, 35, 0.025), 0 12px 32px rgba(67, 46, 35, 0.035)',
        lift: '0 4px 12px rgba(67, 46, 35, 0.04), 0 16px 40px rgba(67, 46, 35, 0.055)'
      },
      transitionTimingFunction: {
        ease: 'ease'
      }
    }
  },
  plugins: []
};

export default config;
