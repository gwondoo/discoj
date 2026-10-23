import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Korean font subsets stay separate files so only the glyphs on screen download.
  build: {assetsInlineLimit: file => /\.woff2?$/.test(file) ? false : undefined},
});
