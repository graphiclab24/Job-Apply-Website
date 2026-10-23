import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  // Support GitHub Pages subpath (e.g. /Job-Apply-Website/) while keeping root '/' for Cloudflare Pages/local
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const repoName = process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : '/Job-Apply-Website/';
  const base = process.env.BASE_PATH || (isGitHubActions ? repoName : '/');

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      // বড় চাঙ্কের সতর্কতা ৬০০ KB-এর উপরে হলে দেখাবে
      chunkSizeWarningLimit: 600,
      // esbuild দিয়ে minify (ডিফল্ট) — স্পষ্টভাবে রাখা হলো
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Firebase Firestore আলাদা চাঙ্কে (লেজি লোড হবে, হোম পাতায় লাগে না)
            if (id.includes('node_modules/firebase/firestore') || id.includes('node_modules/@firebase/firestore')) {
              return 'vendor-firestore';
            }
            // Firebase Auth আলাদা চাঙ্কে (লগইন দরকার হলে লোড হবে)
            if (id.includes('node_modules/firebase/auth') || id.includes('node_modules/@firebase/auth')) {
              return 'vendor-auth';
            }
            // বাকি Firebase core ও app
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
              return 'vendor-react';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
