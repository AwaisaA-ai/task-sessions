import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.warn('[build-main] watching electron/ - reload the app to pick up main-process changes.');
} else {
  await esbuild.build(options);
}
