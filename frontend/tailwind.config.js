/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sequor: {
          dark: '#0b0f19',     // Main Website Background (Deep Midnight Navy)
          card: '#141c2e',     // Website Service Card Background
          border: '#22304a',   // Website Card Border
          lime: '#a3e635',     // Website Signature Lime Green Accent
          mint: '#5eead4',     // Website Mint Teal Button Color
          cyan: '#a3e635',     // Match Lime Green
          blue: '#38bdf8',     // Sky Blue
          light: '#f8fafc',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'widget': '0 20px 30px -10px rgba(0, 0, 0, 0.6), 0 10px 15px -5px rgba(0, 0, 0, 0.4)',
        'bubble': '0 2px 8px -2px rgba(0, 0, 0, 0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
