import { withTransaction, type Pool } from '../../db/pool.js';
import { ownerOf, type Owner } from '../../shared/owner.js';
import { toDbDateTime, truncateToSecond, type Clock } from '../../shared/time.js';
import type { Identity, NewUser } from '../identity/identity.js';
import { DEFAULT_SETTINGS, type SettingsService } from '../settings/service.js';
import { DEFAULT_VIEW_ITEMS } from './defaults.js';
import * as repo from './repository.js';

/**
 * Account lifecycle (design-accounts.md): a user is created ready to use, credentials and starting
 * state together. The starting state: the settings of the administrator who creates the user
 * (approved 2026-10-03: people on one instance usually share a place and a currency), the defaults
 * for the first administrator, and the default layout of every page. Deleting a user comes with the
 * admin routes.
 */
export class AccountLifecycle {
  constructor(
    private readonly pool: Pool,
    private readonly identity: Identity,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /** The new user's id. `createdBy`: the administrator creating it, null for the first one. */
  async createUser(input: NewUser, createdBy: Owner | null): Promise<number> {
    const settings = createdBy ? await this.settings.get(createdBy) : DEFAULT_SETTINGS;
    const id = await this.identity.createUser(input);
    try {
      const createdAt = toDbDateTime(truncateToSecond(this.clock()));
      await withTransaction(this.pool, (conn) =>
        repo.insertStartingState(
          conn,
          ownerOf(id),
          { timezone: settings.timezone, day_starts_at: settings.dayStartsAt, currency: settings.currency },
          DEFAULT_VIEW_ITEMS,
          createdAt,
        ),
      );
    } catch (err) {
      await repo.deleteFreshUser(this.pool, id).catch(() => undefined);
      throw err;
    }
    return id;
  }
}
