// Checks on build output that catch Safari 15 incompatibilities the linters
// cannot see (code from dependencies, bundler transforms). Brief §13.7.
import { gzipSync } from 'node:zlib';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse, type Node } from 'acorn';
import { simple } from 'acorn-walk';
import postcss from 'postcss';

const LOOKBEHIND = /\(\?<[=!]/;

function parseAny(code: string): Node {
  const opts = { ecmaVersion: 2022 as const, allowHashBang: true };
  try {
    return parse(code, { ...opts, sourceType: 'module' });
  } catch {
    return parse(code, { ...opts, sourceType: 'script' });
  }
}

interface RegexLiteral extends Node {
  regex?: { pattern: string };
  value?: unknown;
}

interface CallLike extends Node {
  callee: Node & { name?: string };
  arguments: RegexLiteral[];
}

/** Returns human-readable problems; an empty array means the file is safe for Safari 15. */
export function findJsCompatIssues(code: string): string[] {
  let ast: Node;
  try {
    ast = parseAny(code);
  } catch (e) {
    return [`does not parse as ES2022: ${(e as Error).message}`];
  }
  const issues: string[] = [];
  const checkRegExpCall = (node: Node) => {
    const call = node as CallLike;
    const first = call.arguments[0];
    if (
      call.callee.name === 'RegExp' &&
      first?.type === 'Literal' &&
      typeof first.value === 'string' &&
      LOOKBEHIND.test(first.value)
    ) {
      issues.push(`regex lookbehind in RegExp(...) at ${node.start}`);
    }
  };
  simple(ast, {
    StaticBlock(node) {
      issues.push(`class static block at ${node.start}`);
    },
    Literal(node) {
      const pattern = (node as RegexLiteral).regex?.pattern;
      if (pattern && LOOKBEHIND.test(pattern))
        issues.push(`regex lookbehind literal at ${node.start}`);
    },
    NewExpression: checkRegExpCall,
    CallExpression: checkRegExpCall,
  });
  return issues;
}

export function findCssCompatIssues(css: string): string[] {
  const root = postcss.parse(css);
  const issues: string[] = [];
  root.walkAtRules('container', (r) => {
    issues.push(`@container rule: ${r.params}`);
  });
  root.walkDecls((d) => {
    if (d.value.includes('color-mix(')) issues.push(`color-mix() in ${d.prop}`);
  });
  root.walkRules((r) => {
    if (r.parent?.type === 'rule')
      issues.push(`nested rule "${r.selector}" inside "${r.parent.selector}"`);
  });
  return issues;
}

export function gzipSize(buf: Buffer): number {
  return gzipSync(buf, { level: 9 }).length;
}

/** All files under dir, as paths relative to dir (posix separators). */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}
