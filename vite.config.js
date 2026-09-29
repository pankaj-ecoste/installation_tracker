import { defineConfig } from 'vite';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// Stamped once per build. The running app compares this against dist/version.json
// (see src/lib/versionCheck.js) to notice a new deploy without a manual refresh.
const buildVersion = String(Date.now());

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [
    {
      name: 'write-build-version',
      apply: 'build',
      closeBundle() {
        writeFileSync(
          resolve(process.cwd(), 'dist/version.json'),
          JSON.stringify({ version: buildVersion })
        );
      },
    },
  ],
});
