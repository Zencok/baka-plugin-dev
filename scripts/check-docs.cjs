#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const skipped = new Set(['.git', 'node_modules', '.cache', 'coverage']);
const textExtensions = new Set(['.md', '.json', '.js', '.cjs', '.ts', '.yml', '.yaml', '.txt']);
function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (skipped.has(entry.name) || entry.isSymbolicLink()) return [];
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : entry.isFile() ? [file] : [];
  });
}
function readText(file) {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file));
  if (text.startsWith('\uFEFF')) throw new Error('UTF-8 BOM is not allowed');
  if (text.includes('\uFFFD')) throw new Error('Unicode replacement character found');
  return text;
}
function markdownBody(text) {
  let fence = null;
  const body = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!fence && open) {
      fence = { char: open[1][0], size: open[1].length, line: index + 1 };
    } else if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.size) fence = null;
    } else body.push(line);
  }
  if (fence) throw new Error('unclosed code fence at line ' + fence.line);
  return body.join('\n');
}
function headingAnchors(body) {
  const anchors = new Set();
  const duplicates = new Map();
  for (const line of body.split('\n')) {
    const match = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const slug = match[1].toLowerCase().replace(/<[^>]*>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
    const n = duplicates.get(slug) || 0;
    duplicates.set(slug, n + 1);
    anchors.add(n ? slug + '-' + n : slug);
  }
  for (const match of body.matchAll(/<(?:a|[a-z][\w-]*)\s+[^>]*?\b(?:id|name)=["']([^"']+)["']/gi)) anchors.add(match[1]);
  return anchors;
}
function linkTargets(body) {
  // The repository uses ordinary Markdown links, not arbitrary embedded HTML.
  // Ignore code spans so tutorial syntax is not treated as a real destination.
  body = body.replace(/(`+)[\s\S]*?\1/g, '');
  const targets = [];
  const inline = /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:\\.|[^\s()\\]|\([^()]*\))+)(?:\s+["'][^\n]*?["'])?\s*\)/g;
  for (const match of body.matchAll(inline)) targets.push(match[1].replace(/^<|>$/g, ''));
  for (const match of body.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm)) targets.push(match[1].replace(/^<|>$/g, ''));
  for (const match of body.matchAll(/<(?:a|img)\s+[^>]*?\b(?:href|src)=["']([^"']+)["']/gi)) targets.push(match[1]);
  return targets;
}
function checkDocs(root) {
  root = path.resolve(root);
  const errors = [];
  const docs = new Map();
  for (const file of filesUnder(root)) {
    if (!textExtensions.has(path.extname(file)) && !['LICENSE', 'NOTICE', '.gitignore'].includes(path.basename(file))) continue;
    try {
      const text = readText(file);
      if (path.extname(file) === '.md') docs.set(file, markdownBody(text));
    } catch (error) { errors.push(path.relative(root, file) + ': ' + error.message); }
  }
  for (const [file, body] of docs) {
    for (const target of linkTargets(body)) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) continue;
      try {
        const hash = target.indexOf('#');
        const rawPath = hash < 0 ? target : target.slice(0, hash);
        const anchor = hash < 0 ? '' : decodeURIComponent(target.slice(hash + 1));
        const localPath = decodeURIComponent(rawPath.split('?')[0]).replace(/\\([ ()])/g, '$1');
        const destination = !localPath ? file : localPath.startsWith('/')
          ? path.resolve(root, '.' + localPath) : path.resolve(path.dirname(file), localPath);
        const relative = path.relative(root, destination);
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('link leaves repository');
        if (!fs.existsSync(destination)) throw new Error('missing local destination');
        if (anchor && path.extname(destination) === '.md') {
          const destinationBody = docs.get(destination) ?? markdownBody(readText(destination));
          if (!headingAnchors(destinationBody).has(anchor)) throw new Error('missing Markdown anchor #' + anchor);
        }
      } catch (error) { errors.push(path.relative(root, file) + ': ' + target + ': ' + error.message); }
    }
  }
  return { files: docs.size, errors };
}
if (require.main === module) {
  try {
    const result = checkDocs(process.argv[2] || path.join(__dirname, '..'));
    for (const error of result.errors) console.error(error);
    console.log(result.files + ' Markdown files checked; ' + result.errors.length + ' errors.');
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { checkDocs, markdownBody, headingAnchors, linkTargets, readText };
