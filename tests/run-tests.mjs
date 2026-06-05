import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { builtinModules } from 'node:module';
import esbuild from 'esbuild';

const outdir = '.tmp-tests';
const testFiles = [
	'sync/lifeos-markdown.test.mjs',
	'api/graph-request.test.mjs',
].map((file) => `${outdir}/${file}`);

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await esbuild.build({
	entryPoints: [
		'tests/sync/lifeos-markdown.test.ts',
		'tests/api/graph-request.test.ts',
	],
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'node24',
	outdir,
	entryNames: '[dir]/[name]',
	outExtension: { '.js': '.mjs' },
	external: ['obsidian', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
	logLevel: 'silent',
});

const child = spawn(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });

child.on('exit', (code) => {
	process.exit(code ?? 1);
});
