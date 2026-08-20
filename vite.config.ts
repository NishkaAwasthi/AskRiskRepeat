import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function geminiKeyPlugin(apiKey: string): Plugin {
  const virtualId = 'virtual:gemini-key';
  const resolvedId = '\0' + virtualId;
  return {
    name: 'gemini-key',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) {
        return `export const GEMINI_API_KEY = ${JSON.stringify(apiKey)};\n`;
      }
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const geminiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
      },
      plugins: [geminiKeyPlugin(geminiKey), react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
