import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
const root = path.resolve(__dirname, '..');
const python = process.platform === 'win32' ? '"' + path.join(root, '.venv/Scripts/python.exe') + '"' : '"' + path.join(root, '.venv/bin/python') + '"';
export default defineConfig({
  testDir: '../tests/e2e', timeout: 45000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure', ...devices['Desktop Chrome'], viewport: { width: 1500, height: 1000 } },
  webServer: [
    { command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`, cwd: root, url: 'http://127.0.0.1:8000/api/health', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 120000 },
  ],
});

