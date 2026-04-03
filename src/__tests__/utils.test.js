import { describe, it, expect } from 'vitest';

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
    expect(parseMultilineInput('  a  \n  b  \n  c  ')).toEqual(['a', 'b', 'c']);
  });

  it('filters blank lines', () => {
    expect(parseMultilineInput('a\n\n\nb')).toEqual(['a', 'b']);
  });

  it('returns empty array for empty input', () => {
    expect(parseMultilineInput('')).toEqual([]);
    expect(parseMultilineInput(undefined)).toEqual([]);
  });
});

// ── formatBytes ───────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats 0 bytes', () => expect(formatBytes(0)).toBe('0 B'));
  it('formats bytes',   () => expect(formatBytes(512)).toBe('512.0 B'));
  it('formats KB',      () => expect(formatBytes(1024)).toBe('1.0 KB'));
  it('formats MB',      () => expect(formatBytes(1024 ** 2)).toBe('1.0 MB'));
  it('formats GB',      () => expect(formatBytes(1024 ** 3)).toBe('1.0 GB'));
});

// ── parseConventionalCommit ───────────────────────────────────────────────────

describe('parseConventionalCommit', () => {
  it('parses a plain feat commit', () => {
    const result = parseConventionalCommit('feat: add dark mode');
    expect(result.type).toBe('feat');
    expect(result.subject).toBe('add dark mode');
    expect(result.scope).toBeNull();
    expect(result.breaking).toBe(false);
  });

  it('parses scope', () => {
    const result = parseConventionalCommit('fix(auth): correct token expiry');
    expect(result.type).toBe('fix');
    expect(result.scope).toBe('auth');
    expect(result.subject).toBe('correct token expiry');
  });

  it('detects breaking change via !', () => {
    const result = parseConventionalCommit('feat!: drop Node 16 support');
    expect(result.breaking).toBe(true);
    expect(result.type).toBe('feat');
  });

  it('detects breaking change in footer', () => {
    const result = parseConventionalCommit(
      'feat: new auth flow\n\nBREAKING CHANGE: session format changed',
    );
    expect(result.breaking).toBe(true);
  });

  it('handles non-conventional commits', () => {
    const result = parseConventionalCommit('Update README');
    expect(result.type).toBeNull();
    expect(result.subject).toBe('Update README');
    expect(result.breaking).toBe(false);
  });
});

// ── parseSections ─────────────────────────────────────────────────────────────

describe('parseSections', () => {
  it('returns DEFAULT_SECTIONS when input is empty', () => {
    expect(parseSections('')).toEqual(DEFAULT_SECTIONS);
    expect(parseSections(undefined)).toEqual(DEFAULT_SECTIONS);
  });

  it('returns DEFAULT_SECTIONS on invalid JSON', () => {
    expect(parseSections('{not json')).toEqual(DEFAULT_SECTIONS);
  });

  it('parses valid JSON array', () => {
    const custom = [{ types: ['feat'], label: 'Features', emoji: '✨' }];
    expect(parseSections(JSON.stringify(custom))).toEqual(custom);
  });
});
