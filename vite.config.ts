import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function readProjectEnv(name: string): string | undefined {
  if (process.env[name]) {
    return process.env[name];
  }

  const projectEnvPath = '/vercel/share/.env.project';
  if (!fs.existsSync(projectEnvPath)) {
    return undefined;
  }

  const line = fs
    .readFileSync(projectEnvPath, 'utf8')
    .split(/\\r?\\n/)
    .find((entry) => entry.startsWith(`${name}=`));

  return line?.slice(name.length + 1).trim() || undefined;
}

const supabaseUrl = readProjectEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = readProjectEnv('VITE_SUPABASE_ANON_KEY');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
