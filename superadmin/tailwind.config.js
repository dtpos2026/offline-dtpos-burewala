/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#3C096C',
          soft: '#5A189A',
          accent: '#7B2CBF',
          tint: '#E0AAFF',
        },
        ink: '#F7F3FC',
        text: '#1B0B2E',
      },
    },
  },
  plugins: [],
}
