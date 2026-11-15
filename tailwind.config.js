/** @type {import('tailwindcss').Config} */
module.exports = {
  // JS is scanned too: UIController/PresetManager toggle classes at runtime
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      // Neutral photo-editor greys with a single blue accent
      colors: {
        lr: {
          field: '#1c1c1c',
          panel: '#2a2a2a',
          header: '#333333',
          button: '#3d3d3d',
          'button-hover': '#4a4a4a',
          line: '#3a3a3a',
          text: '#cfcfcf',
          dim: '#8c8c8c',
          faint: '#6e6e6e',
          accent: '#3b8fe8',
          'accent-hover': '#4f9df0',
        },
      },
    },
  },
  plugins: [],
};
