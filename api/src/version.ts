/**
 * The product's version, one string for the API and the web, which ship together (lenzi,
 * 2026-10-03): `<prefix><year>.<backend>.<frontend>`, both numbers from 0.
 *
 * - `dev`: a development version, on the branch named after it (e.g. `dev26.0.0`); it may end with
 *   a short text for odd work (`dev26.0.1-squircle`).
 * - `a` alpha, `b` beta, `v` release: final versions, only on main, numbers only.
 *
 * It changes only when lenzi says so: the backend number for an approved backend change, the
 * frontend number for an approved frontend change. The pages carry a copy of it and of API_LEVEL
 * (web/src/app/app-version.ts, for the Android app): the CI fails when the two differ.
 */
export const VERSION = 'a26.0.0';

/**
 * The API level the Android app compares with its own (design-android.md, "compatibility"): a whole
 * number that goes up only when a change makes an older app work wrong (a field removed or renamed,
 * a meaning changed, a route gone). Adding fields or routes, and a backend fix, leave it as it is.
 * Like VERSION, it changes only when lenzi says so.
 */
export const API_LEVEL = 1;

/** What a version may look like (VERSION is checked against it by the tests). */
export const VERSION_FORMAT = /^(?:dev\d{2}\.\d+\.\d+(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?|[abv]\d{2}\.\d+\.\d+)$/;
