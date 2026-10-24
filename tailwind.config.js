/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gd: {
          blue: '#00c3ff',
          green: '#23e838',
          yellow: '#ffeb3b',
          pink: '#ff2d75',
          purple: '#9c27b0',
          dark: '#0e121d',
          panel: '#181f33',
          border: '#2a3553'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        cursive: ['cursive', 'sans-serif']
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'rainbow': 'rainbow 3s ease infinite',
        'float': 'float 3s ease-in-out infinite'
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(0, 195, 255, 0.4)' },
          '50%': { boxShadow: '0 0 30px rgba(0, 195, 255, 0.8)' }
        },
        rainbow: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' }
        }
      }
    },
  },
  plugins: [],
}
