import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const INT_UI_KIT_STYLES_RE = /@jetbrains\/int-ui-kit\/dist\/esm\/styles\.css$/;
const INT_UI_KIT_FONT_IMPORT_RE = /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:ital,opsz,wght@0,14\.\.32,100\.\.900;1,14\.\.32,100\.\.900&family=JetBrains\+Mono:ital,wght@0,100\.\.800;1,100\.\.800&display=swap"\);?/g;

function patchIntUiKitStyles() {
  return {
    name: 'patch-int-ui-kit-styles',
    enforce: 'pre',
    transform(code, id) {
      if (!INT_UI_KIT_STYLES_RE.test(id)) {
        return null;
      }

      return {
        code: code.replace(INT_UI_KIT_FONT_IMPORT_RE, ''),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [patchIntUiKitStyles(), react()],
  server: {
    host: 'localhost',
  },
  preview: {
    host: 'localhost',
  },
});
