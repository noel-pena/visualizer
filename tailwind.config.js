/** @type {import('tailwindcss').Config} */
module.exports = {
  // JS is scanned too: UIController/PresetManager toggle classes at runtime
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {},
  },
  plugins: [],
};
