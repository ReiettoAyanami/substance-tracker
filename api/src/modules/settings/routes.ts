import type { FastifyInstance } from 'fastify';
import { settingsPatchSchema, type SettingsPatchBody } from './schemas.js';
import type { SettingsService } from './service.js';

export function settingsRoutes(app: FastifyInstance, deps: { settings: SettingsService }): void {
  const { settings } = deps;

  app.get('/api/settings', async () => settings.get());

  app.patch<{ Body: SettingsPatchBody }>('/api/settings', { schema: settingsPatchSchema }, async (req) =>
    settings.update(req.body),
  );
}
