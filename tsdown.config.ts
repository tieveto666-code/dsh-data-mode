import { defineConfig } from 'tsdown'

const host = {
  entry: {
    index: 'src/index.ts',
    'data-source': 'src/data-source.ts',
    'provider-duckdb': 'src/provider-duckdb.ts',
    'tool-data': 'src/tool-data.ts',
    guard: 'src/guard.ts',
    context: 'src/context.ts',
    'catalog-reader': 'src/catalog-reader.ts',
  },
  dts: false,
  format: 'esm' as const,
  unbundle: true,
  outDir: 'lib',
  clean: false,
  deps: {
    neverBundle: [/^@deepseek-ai\//, 'duckdb', 'yaml'],
  },
}

const clientExternals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-conversation/client',
  '@deepseek-ai/dsh-client-locale/client',
]

const client = {
  name: 'dsh-data-mode/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs' as const,
  platform: 'browser' as const,
  dts: false,
  sourcemap: true,
  clean: false,
  external: clientExternals,
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-data-mode", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([host, client])
