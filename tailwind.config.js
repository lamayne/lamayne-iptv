/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#F4F4F7',
          100: '#E4E4EB',
          200: '#C9C9D6',
          300: '#A1A1B5',
          400: '#71718A',
          500: '#4B4B60',
          600: '#33334A',
          700: '#262633',
          750: '#1C1C26',
          800: '#14141B',
          850: '#101017',
          900: '#0F0F16',
          950: '#0A0A0F',
        },
        accent: {
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
          950: '#2E1065',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(0, 0, 0, 0.65)',
        'accent-glow': '0 0 0 1px rgba(139, 92, 246, 0.25), 0 10px 30px -12px rgba(139, 92, 246, 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
        'pulse-slow': 'pulse 2.5s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};