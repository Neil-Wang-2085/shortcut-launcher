import { build } from 'esbuild'

const common = { bundle: true, logLevel: 'info', sourcemap: false }

await build({
  ...common,
  entryPoints: ['renderer/launcher.ts', 'renderer/popup.ts', 'renderer/settings.ts'],
  format: 'esm',
  target: 'chrome120',
  outdir: 'dist',
})

await build({
  ...common,
  entryPoints: ['src/shared/store.ts', 'src/shared/url-import.ts'],
  format: 'cjs',
  platform: 'node',
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
})

await build({
  ...common,
  entryPoints: ['src/shared/data.ts'],
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/seed.cjs',
})

console.log('bundled renderers + store + seed')
