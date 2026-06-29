import * as path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isPathWithinDirectory } from './pathNormalization';
import { decodeViteId } from './VirtualModule';

export const MAX_RUNNER_BODY_BYTES = 1024 * 1024;
const ALLOWED_RUNNER_INVOKE_NAMES = new Set(['fetchModule', 'getBuiltins']);

export function isAllowedRunnerInvokeName(name: unknown): name is 'fetchModule' | 'getBuiltins' {
  return typeof name === 'string' && ALLOWED_RUNNER_INVOKE_NAMES.has(name);
}

export function isSafeRunnerModuleId(id: unknown, projectRoot: string): boolean {
  if (typeof id !== 'string' || !id || id.includes('\0')) return false;

  const decoded = decodeViteId(id).replace(/^\0+/, '');
  if (decoded.includes('..')) return false;
  if (decoded.startsWith('virtual:mf') || decoded.includes('virtual:mf:')) return true;
  if (decoded.includes('node_modules')) return true;
  if (path.isAbsolute(decoded)) {
    return isPathWithinDirectory(decoded, projectRoot);
  }

  return !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(decoded) && !decoded.startsWith('//');
}

export function readBoundedRequestBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes = MAX_RUNNER_BODY_BYTES
): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    const fail = (statusCode: number, message: string) => {
      if (!res.writableEnded) {
        res.statusCode = statusCode;
        res.end(message);
      }
      resolve(undefined);
    };

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        if (typeof req.destroy === 'function') req.destroy();
        fail(413, 'Payload too large');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => fail(400, 'Bad request'));
  });
}
