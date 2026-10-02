/**
 * The product's version, one string for the API and the web, which ship together (lenzi,
 * 2026-10-03): `<prefix><year>.<backend>.<frontend>`, both numbers from 0.
 *
 * - `dev`: a development version, on the branch named after it (e.g. `dev26.0.0`); it may end with
 *   a short text for odd work (`dev26.0.1-squircle`).
 * - `a` alpha, `b` beta, `v` release: final versions, only on main, numbers only.
 *
 * It changes only when lenzi says so: the backend number for an approved backend change, the
 * frontend number for an approved frontend change.
 */
export const VERSION = 'dev26.0.0';

/** What a version may look like (VERSION is checked against it by the tests). */
export const VERSION_FORMAT = /^(?:dev\d{2}\.\d+\.\d+(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?|[abv]\d{2}\.\d+\.\d+)$/;
