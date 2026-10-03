/**
 * The owner of a request (design-accounts.md, "owner", "The domain, per owner"): the user it works
 * for, always the user of its session, never read from the URL or the body.
 *
 * Every repository function of the domain takes one as its first parameter after the database,
 * and narrows every query to it: a substance by its user_id, a batch, a consumption, an
 * adjustment, a one-time consumption through their substance, settings and view items by their
 * own user_id. Something of another user is then simply not found (404), never "forbidden".
 *
 * The brand makes a plain number unusable where an Owner is expected, so forgetting the owner does
 * not compile. Only the request hook, the account lifecycle (a new user's starting state) and the
 * tests make one: a source-rule test holds that.
 */
declare const ownerBrand: unique symbol;

export interface Owner {
  readonly userId: number;
  readonly [ownerBrand]: true;
}

export function ownerOf(userId: number): Owner {
  return { userId } as Owner;
}
