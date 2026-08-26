#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const scanRoots = ['src', 'bin', 'test', 'scripts'];
const errors = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function fail(file, message) {
  errors.push(`${relative(file)}: ${message}`);
}

const jsFiles = scanRoots.flatMap(name => walk(path.join(root, name))).filter(file => file.endsWith('.js'));
const textFiles = [
  ...jsFiles,
  ...walk(path.join(root, '.github')).filter(file => /\.(?:yml|yaml)$/.test(file)),
  ...['package.json', 'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', '.editorconfig']
    .map(name => path.join(root, name))
    .filter(file => fs.existsSync(file))
];

for (const file of jsFiles) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) fail(file, `syntax check failed\n${check.stderr.trim()}`);
}

for (const file of textFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('\r')) fail(file, 'CRLF line endings are not allowed');
  if (!content.endsWith('\n')) fail(file, 'file must end with a newline');

  content.split('\n').forEach((line, index) => {
    if (/[ \t]+$/.test(line)) fail(file, `trailing whitespace on line ${index + 1}`);
    if (file.endsWith('.js') && line.includes('\t')) fail(file, `tab indentation on line ${index + 1}`);
  });

  const rel = relative(file);
  if (rel.startsWith('src/') || rel.startsWith('bin/')) {
    if (/\beval\s*\(/.test(content)) fail(file, 'eval() is not allowed');
    if (/\bnew\s+Function\s*\(/.test(content)) fail(file, 'new Function() is not allowed');
  }

  if (rel.startsWith('src/')) {
    if (/\bbrowser\s*\./.test(content)) fail(file, 'core source must not depend on a runner-global browser object');
    if (/process\.exit\s*\(/.test(content)) fail(file, 'library source must not terminate the host process');
  }
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.type !== 'module') fail(pkgPath, 'package must remain ESM');
if (pkg.scripts?.postinstall) fail(pkgPath, 'public package must not use postinstall side effects');
if (pkg.engines?.node !== '>=20') fail(pkgPath, 'supported runtime baseline must remain explicit (>=20)');
for (const required of ['lint', 'test', 'test:coverage', 'package:check', 'quality']) {
  if (!pkg.scripts?.[required]) fail(pkgPath, `missing required quality script: ${required}`);
}

if (errors.length) {
  console.error(`[QKTestAnalytics] Lint failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[QKTestAnalytics] Lint passed (${jsFiles.length} JavaScript files checked).`);
