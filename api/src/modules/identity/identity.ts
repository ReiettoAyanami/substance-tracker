import type { Pool } from '../../db/pool.js';
import { ProblemError, badRequest, conflict, notFound } from '../../shared/errors.js';
import { IMPERSONATION_MINUTES, USERNAME_PATTERN, type Auth } from './auth.js';
import { runAuth } from './insert-memory.js';
import { passwordProblem } from './passwords.js';
import * as repo from './repository.js';

/**
 * Identity (design-accounts.md, "Identity"): who is asking, and the users' credentials. The only
 * holder of the Better Auth object; it knows nothing of substances, settings or what a page shows.
 */

export type Role = 'user' | 'admin';

/** Who is asking: the user of the request's session. */
export interface RequestUser {
  userId: number;
  username: string;
  role: Role;
  /** The administrator acting as this user (impersonation), or null. */
  impersonatedBy: number | null;
}

export interface NewUser {
  username: string;
  email: string;
  /** null: a user who cannot sign in until a password is set (test-user). */
  password: string | null;
  role: Role;
}

/** Top-level paths of the app and the server: a user called `admin` would hide the admin panel. */
export const RESERVED_USERNAMES: readonly string[] = ['login', 'admin', 'api', 'download', 'assets', 'media', 'setup'];

/** What is wrong with a username, or null. It is compared lowercase and never changes. */
export function usernameProblem(username: string): string | null {
  if (username.length < 3) return 'The username needs at least 3 characters';
  if (username.length > 30) return 'The username can have at most 30 characters';
  if (!USERNAME_PATTERN.test(username)) return 'The username can only have lowercase letters, digits, - and _';
  if (RESERVED_USERNAMES.includes(username)) return `"${username}" is a reserved word`;
  return null;
}

interface AuthErrorBody {
  code?: string;
  message?: string;
}

/** Better Auth's errors as the API's problems. */
function asProblem(err: unknown): unknown {
  const body = (err as { body?: AuthErrorBody } | null)?.body;
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  if (!body?.code || typeof status !== 'number') return err;
  switch (body.code) {
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
    case 'USER_ALREADY_EXISTS':
      return conflict('email-taken', 'This email is already used by another user');
    case 'USERNAME_IS_ALREADY_TAKEN':
      return conflict('username-taken', 'This username is already taken');
    case 'INVALID_EMAIL':
      return badRequest('The email is not valid', 'email');
    default:
      return new ProblemError(status, body.code.toLowerCase().replace(/_/g, '-'), body.message ?? body.code);
  }
}

export class Identity {
  constructor(
    private readonly auth: Auth,
    private readonly pool: Pool,
  ) {}

  /** The auth endpoints the app uses (routes.ts decides which), answered by Better Auth. */
  handle(request: Request): Promise<Response> {
    return runAuth(() => this.auth.handler(request));
  }

  /**
   * Who is asking, from the request's session cookie, or null. An impersonation older than an hour
   * ends here: Better Auth would stretch it to the 30 days of any session at its first read.
   */
  async userOf(headers: Headers): Promise<RequestUser | null> {
    const found = await runAuth(() => this.auth.api.getSession({ headers }));
    if (!found) return null;
    const { user, session } = found;
    const impersonatedBy = session.impersonatedBy ? Number(session.impersonatedBy) : null;
    if (impersonatedBy !== null && Date.now() - new Date(session.createdAt).getTime() > IMPERSONATION_MINUTES * 60_000) {
      const context = await this.auth.$context;
      await runAuth(() => context.internalAdapter.deleteSession(session.token));
      return null;
    }
    return {
      userId: Number(user.id),
      username: String(user.username),
      role: user.role === 'admin' ? 'admin' : 'user',
      impersonatedBy,
    };
  }

  /** Creates a user with its credentials only (Account lifecycle adds its starting state). */
  async createUser(input: NewUser): Promise<number> {
    const username = input.username.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    const nameProblem = usernameProblem(username);
    if (nameProblem) throw badRequest(nameProblem, 'username');
    if (input.password !== null) {
      const problem = passwordProblem(input.password);
      if (problem) throw badRequest(problem, 'password');
    }
    try {
      const created = await runAuth(() =>
        this.auth.api.createUser({
          body: {
            email,
            name: '',
            role: input.role,
            data: { username },
            ...(input.password === null ? {} : { password: input.password }),
          },
        }),
      );
      return Number(created.user.id);
    } catch (err) {
      throw asProblem(err);
    }
  }

  /**
   * A new password for a user (an administrator's reset, the command line, the first account): the
   * rules, never one the user already had, and every session of the user closed. A user without a
   * password (test-user) gets its credential account here.
   */
  async setPassword(userId: number, password: string): Promise<void> {
    const problem = passwordProblem(password);
    if (problem) throw badRequest(problem, 'password');
    const context = await this.auth.$context;
    await runAuth(async () => {
      const user = await context.internalAdapter.findUserById(String(userId));
      if (!user) throw notFound('User', userId);
      const account = await context.internalAdapter.findCredentialAccount(String(userId));
      const earlier = await repo.passwordHistory(this.pool, userId);
      for (const hash of [account?.password, ...earlier]) {
        if (hash && (await context.password.verify({ hash, password }))) {
          throw conflict('password-used-before', 'This password was already used: choose one never used before');
        }
      }
      const hash = await context.password.hash(password);
      if (account) {
        await context.internalAdapter.updatePassword(String(userId), hash);
        if (account.password) await repo.addPasswordToHistory(this.pool, userId, account.password);
      } else {
        await context.internalAdapter.createAccount({
          userId: String(userId),
          providerId: 'credential',
          accountId: String(userId),
          password: hash,
        });
      }
      await context.internalAdapter.deleteUserSessions(String(userId));
    });
  }
}
