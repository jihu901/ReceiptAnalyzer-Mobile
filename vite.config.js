import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ReceiptAnalyzer-Mobile/',
  plugins: [VitePWA({registerType: 'autoUpdate', includeAssets: ['icon-192.png', 'icon-512.png']})]
});
