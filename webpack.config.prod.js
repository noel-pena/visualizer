const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
  mode: 'production',
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'img', to: 'img' },
        { from: 'css', to: 'css', globOptions: { ignore: ['**/tailwind.css'] } }, // tailwind.css is compiled into css/app.css
        { from: 'js/vendor', to: 'js/vendor' },
        { from: 'icon.svg', to: 'icon.svg' },
        { from: 'favicon.ico', to: 'favicon.ico' },
        { from: 'robots.txt', to: 'robots.txt' },
        { from: 'icon-192.png', to: 'icon-192.png' },
        { from: 'icon-512.png', to: 'icon-512.png' },
        { from: 'apple-touch-icon.png', to: 'apple-touch-icon.png' },
        { from: 'sw.js', to: 'sw.js' },
        { from: '404.html', to: '404.html' },
        { from: 'site.webmanifest', to: 'site.webmanifest' },
      ],
    }),
  ],
});
