/** GET /api/settings: how dates and money are shown (design.md, Appendix B). */
export interface Settings {
  /** IANA time zone of the logical day, e.g. "Europe/Rome". */
  timezone: string;
  /** Start of the logical day, "HH:MM:SS". */
  dayStartsAt: string;
  /** ISO 4217 currency code, e.g. "EUR". */
  currency: string;
}
