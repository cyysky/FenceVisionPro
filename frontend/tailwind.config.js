/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0fdf4',  // green-50
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',  // primary
          600: '#16a34a',  // hover
          700: '#15803d',  // deep green (matches card)
          800: '#166534',
          900: '#14532d',
        },
      },
    },
  },
  plugins: [],
};
