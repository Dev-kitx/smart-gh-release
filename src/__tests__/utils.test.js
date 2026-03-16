import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseMultilineInput,
  formatBytes,
  parseConventionalCommit,
  parseSections,
  DEFAULT_SECTIONS,
} from '../utils.js';

// ── parseMultilineInput ───────────────────────────────────────────────────────

describe('parseMultilineInput', () => {
  it('splits on newlines and trims whitespace', () => {
    assert.deepEqual(parseMultilineInput('  a  \n  b  \n  c  '), ['a', 'b', 'c']);
  });

  it('filters blank lines', () => {
    assert.deepEqual(parseMultilineInput('a\n\n\nb'), ['a', 'b']);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(parseMultilineInput(''), []);
    assert.deepEqual(parseMultilineInput(undefined), []);
  });
});

// ── formatBytes ───────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats 0 bytes', () => assert.equal(formatBytes(0), '0 B'));
  it('formats bytes',   () => assert.equal(formatBytes(512), '512.0 B'));
  it('formats KB',      () => assert.equal(formatBytes(1024), '1.0 KB'));
  it('formats MB',      () => assert.equal(formatBytes(1024 ** 2), '1.0 MB'));
  it('formats GB',      () => assert.equal(formatBytes(1024 ** 3), '1.0 GB'));
});

// ── parseConventionalCommit ───────────────────────────────────────────────────

describe('parseConventionalCommit', () => {
  it('parses a plain feat commit', () => {
    const result = parseConventionalCommit('feat: add dark mode');
    assert.equal(result.type, 'feat');
    assert.equal(result.subject, 'add dark mode');
    assert.equal(result.scope, null);
    assert.equal(result.breaking, false);
  });

  it('parses scope', () => {
    const result = parseConventionalCommit('fix(auth): correct token expiry');
    assert.equal(result.type, 'fix');
    assert.equal(result.scope, 'auth');
    assert.equal(result.subject, 'correct token expiry');
  });

  it('detects breaking change via !', () => {
    const result = parseConventionalCommit('feat!: drop Node 16 support');
    assert.equal(result.breaking, true);
    assert.equal(result.type, 'feat');
  });

  it('detects breaking change in footer', () => {
    const result = parseConventionalCommit(
      'feat: new auth flow\n\nBREAKING CHANGE: session format changed',
    );
    assert.equal(result.breaking, true);
  });

  it('handles non-conventional commits', () => {
    const result = parseConventionalCommit('Update README');
    assert.equal(result.type, null);
    assert.equal(result.subject, 'Update README');
    assert.equal(result.breaking, false);
  });
});

// ── parseSections ─────────────────────────────────────────────────────────────

describe('parseSections', () => {
  it('returns DEFAULT_SECTIONS when input is empty', () => {
    assert.deepEqual(parseSections(''), DEFAULT_SECTIONS);
    assert.deepEqual(parseSections(undefined), DEFAULT_SECTIONS);
  });

  it('returns DEFAULT_SECTIONS on invalid JSON', () => {
    assert.deepEqual(parseSections('{not json'), DEFAULT_SECTIONS);
  });

  it('parses valid JSON array', () => {
    const custom = [{ types: ['feat'], label: 'Features', emoji: '✨' }];
    assert.deepEqual(parseSections(JSON.stringify(custom)), custom);
  });
});
