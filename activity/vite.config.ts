import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Mirrors the nginx /thumb/<id> route so previews show real thumbnails.
  server: {proxy: {'/thumb': {target: 'https://i.ytimg.com', changeOrigin: true, rewrite: path => path.replace(/^\/thumb\/([\w-]{11})$/, '/vi/$1/mqdefault.jpg')}}},
  // Korean font subsets stay separate files so only the glyphs on screen download.
  build: {assetsInlineLimit: file => /\.woff2?$/.test(file) ? false : undefined},
});
