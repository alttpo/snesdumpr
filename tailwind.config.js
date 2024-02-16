/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
      "./cmd/webserver/templates/**/*.html",
      "./ts/**/*.{ts,js}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

