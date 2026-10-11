import { readFileSync } from 'node:fs';
import { defineConfig, type Connect, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * YG-01: index.html always loads /sdk.js before the game code. Outside the platform
 * (vite dev, vite preview) there is no SDK, so an empty script is served instead of a 404.
 */
function sdkStub(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/sdk.js') return next();
    res.setHeader('Content-Type', 'text/javascript');
    res.end('/* The Yandex Games SDK comes from the platform; LocalPlatform is used here. */\n');
  };
  return {
    name: 'splav-sdk-stub',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

/**
 * TECH-04, BLD-03: Phaser keeps its site URL for the console banner (which is off). The build must
 * not contain external links, so the URL is cut out of the bundle.
 */
function stripPhaserUrl(): Plugin {
  return {
    name: 'splav-strip-phaser-url',
    apply: 'build',
    renderChunk(code) {
      return code.includes('https://phaser.io')
        ? { code: code.replace(/https:\/\/phaser\.io\/?/g, ''), map: null }
        : null;
    },
  };
}

/**
 * Clean console in Firefox (QA-03): Phaser 4 uploads its built-in 1×1 '__NORMAL' texture from a
 * Uint8Array with premultiply-alpha and flip-Y on, and Firefox warns "Alpha-premult and y-flip are
 * deprecated for non-DOM-Element uploads". Both flags do nothing for typed-array data, so they are
 * turned off. If a Phaser update changes this code the build fails, so the patch gets reviewed.
 */
const PHASER_UINT8_UPLOAD =
  'renderer.createUint8ArrayTexture(source, width, height, undefined, flipY)';
function patchPhaserTypedUploads(): Plugin {
  return {
    name: 'splav-patch-phaser-typed-uploads',
    transform(code, id) {
      if (!/[\\/]node_modules[\\/]phaser[\\/]dist[\\/]phaser\.esm\.js$/.test(id)) return null;
      if (!code.includes(PHASER_UINT8_UPLOAD)) {
        this.error('splav-patch-phaser-typed-uploads: pattern not found, review the patch');
      }
      return {
        code: code.replace(
          PHASER_UINT8_UPLOAD,
          'renderer.createUint8ArrayTexture(source, width, height, false, false)',
        ),
        map: null,
      };
    },
  };
}

/** BLD-02: file names in the archive use only a-z, 0-9, '.', '_', '-'. */
const lower = (name: string): string => name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // DEV-02: test hooks exist in dev and e2e builds only, never in the release build.
    __DEV_HOOKS__: JSON.stringify(mode !== 'production'),
  },
  plugins: [sdkStub(), stripPhaserUrl(), patchPhaserTypedUploads()],
  // Phaser goes through the plugin pipeline in dev too, so the patch above applies there.
  optimizeDeps: { exclude: ['phaser'] },
  server: {
    // The preview pane of the Claude app may assign a free port through PORT.
    ...(process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : {}),
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    // Phaser alone is ~1.4 MB minified; PERF-01 allows up to 5 MB before ready().
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      output: {
        hashCharacters: 'hex',
        entryFileNames: (chunk) => `assets/${lower(chunk.name)}-[hash].js`,
        chunkFileNames: (chunk) => `assets/${lower(chunk.name)}-[hash].js`,
        assetFileNames: (asset) =>
          `assets/${lower((asset.names[0] ?? 'asset').replace(/\.[^.]*$/, ''))}-[hash][extname]`,
      },
    },
  },
}));
