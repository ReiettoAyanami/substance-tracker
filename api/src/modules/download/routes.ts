import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { ProblemError } from '../../shared/errors.js';
import { VERSION } from '../../version.js';

/**
 * The Android app's APK, public (design-android.md, "/download"): it is needed before signing in on
 * the phone. The image built by the CI carries it (APK_FILE); one built without the CI has none, and
 * the answer is a 404 problem that the /download page reads as "take it from the GitHub Release".
 * HEAD answers the same, without the file: the page asks it whether there is one.
 */
export function downloadRoutes(app: FastifyInstance, deps: { apkFile: string | undefined }): void {
  app.get('/download/substance.apk', async (_request, reply) => {
    const size = deps.apkFile ? await fileSize(deps.apkFile) : null;
    if (!deps.apkFile || size === null) {
      throw new ProblemError(404, 'no-apk', 'This instance carries no APK: take it from the GitHub Release of its version');
    }
    return reply
      .type('application/vnd.android.package-archive')
      .header('content-length', size)
      .header('content-disposition', `attachment; filename="substance-tracker-${VERSION}.apk"`)
      .send(createReadStream(deps.apkFile));
  });
}

async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}
