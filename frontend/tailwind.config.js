/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Colors are defined in globals.css via @theme for Tailwind v4
      // No need to redefine them here
    },
  },
  plugins: []
}
