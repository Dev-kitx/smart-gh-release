import * as core from '@actions/core';
import * as glob from '@actions/glob';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseMultilineInput, formatBytes, getMimeType } from './utils.js';

export class AssetManager {
  /**
   * @param {object} inputs  Parsed action inputs
   */
  constructor(inputs) {
    this.inputs = inputs;
  }

  /**
   * Resolve all glob patterns from the `files` input to concrete file paths.
   * Deduplicates the result.
   *
   * @returns {Promise<string[]>}
   */
  async resolveFiles() {
    const patterns = parseMultilineInput(this.inputs.files);
    if (patterns.length === 0) return [];

    const resolved = [];

    for (const pattern of patterns) {
      const globber = await glob.create(pattern, { followSymbolicLinks: false });
      const matches = await globber.glob();

      if (matches.length === 0) {
        const msg = `Pattern "${pattern}" matched no files.`;
        if (this.inputs.failOnUnmatchedFiles) {
          throw new Error(msg);
        }
        core.warning(msg);
      }

      resolved.push(...matches);
    }

    // Deduplicate while preserving order
    return [...new Set(resolved)];
  }

  /**
   * Verify that every pattern in `required_assets` matches at least one
   * already-resolved file. Throws if a required asset is missing.
   *
   * @param {string[]} resolvedFiles
   */
  async validateRequired(resolvedFiles) {
    const patterns = parseMultilineInput(this.inputs.requiredAssets);

    for (const pattern of patterns) {
      const globber = await glob.create(pattern, { followSymbolicLinks: false });
      const matches = await globber.glob();

      const found = matches.some((m) => resolvedFiles.includes(m));
      if (!found) {
        throw new Error(
          `Required asset pattern "${pattern}" matched no resolved files. ` +
            `Ensure all expected build artifacts are present before releasing.`,
        );
      }
    }
  }

  /**
   * Generate a checksums.txt file (SHA-256) for the given files and write it
   * to disk. Returns the path to the written file.
   *
   * @param {string[]} files
   * @param {string}   checksumFilePath
   * @returns {Promise<string>}
   */
  async generateChecksumsFile(files, checksumFilePath) {
    const lines = await Promise.all(
      files.map(async (filePath) => {
        const content = await readFile(filePath);
        const hash = createHash('sha256').update(content).digest('hex');
        return `${hash}  ${basename(filePath)}`;
      }),
    );

    await writeFile(checksumFilePath, lines.join('\n') + '\n', 'utf8');
    core.info(`Generated ${checksumFilePath} with ${files.length} entr${files.length === 1 ? 'y' : 'ies'}`);
    return checksumFilePath;
  }

  /**
   * Upload files to the release, optionally prepending a checksums file.
   * Returns the number of successfully uploaded assets.
   *
   * @param {import('@octokit/core').Octokit} octokit
   * @param {string}   uploadUrl
   * @param {string[]} files
   * @param {boolean}  generateChecksums
   * @param {string}   checksumFilePath
   * @returns {Promise<number>}
   */
  async uploadAssets(octokit, uploadUrl, files, generateChecksums, checksumFilePath) {
    const uploadQueue = [...files];

    if (generateChecksums && files.length > 0) {
      const checksumFile = await this.generateChecksumsFile(files, checksumFilePath);
      uploadQueue.push(checksumFile);
    }

    let uploaded = 0;

    for (const filePath of uploadQueue) {
      const fileName = basename(filePath);

      try {
        const [content, { size }] = await Promise.all([readFile(filePath), stat(filePath)]);

        core.info(`  ↑ ${fileName}  (${formatBytes(size)})`);

        await octokit.rest.repos.uploadReleaseAsset({
          url: uploadUrl,
          headers: {
            'content-type': getMimeType(fileName),
            'content-length': size,
          },
          name: fileName,
          data: content,
        });

        uploaded++;
      } catch (err) {
        // Re-throw with clearer context
        throw new Error(`Failed to upload asset "${fileName}": ${err.message}`);
      }
    }

    return uploaded;
  }
}
