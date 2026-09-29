// Dev only. Fills the freshly created demo database through the API; run by reset-demo.sh with
// Node inside the api container. Every instant is fixed and the database is new, so two runs give
// the same data with the same ids (and so the same identity colours).
// Each substance exercises one case of the card: many batches, tiny segments, a finished last
// batch, decimals, stock 0 with one-time consumptions, no batches, a huge name and price, archived.
// The last block feeds the consumptions page: more than 20 consumptions for one substance, weeks
// of history, finished batches, a free one-time consumption, a cancelled one, notes. It comes last
// so the ids above (and their identity colours) never change.

const API = 'http://localhost:3000/api';

async function call(method, path, body) {
  const response = await fetch(API + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`);
  return data;
}

const substance = (body) => call('POST', '/substances', body);
const batch = (substanceId, body) => call('POST', `/substances/${substanceId}/batches`, body);
const consume = (batchId, quantity, occurredAt, note) =>
  call('POST', `/batches/${batchId}/consumptions`, { quantity, occurredAt, ...(note ? { note } : {}) });
const adjust = (batchId, delta, reason, occurredAt) =>
  call('POST', `/batches/${batchId}/adjustments`, { delta, reason, occurredAt });
const oneTime = (substanceId, body) => call('POST', `/substances/${substanceId}/one-time-consumptions`, body);

// Caffè: 6 active batches of mixed sizes; a remnant of 1 out of 100 and a batch of 1 (tiny segments).
const coffee = await substance({ name: 'Caffè', unit: 'capsula', refillQuantity: '10' });
const c1 = await batch(coffee.id, { name: 'Lavazza A Modo Mio', quantity: '100', totalPrice: '35.00', occurredAt: '2026-07-01T16:00:00Z' });
await consume(c1.id, '40', '2026-07-15T07:00:00Z');
await consume(c1.id, '40', '2026-08-01T07:00:00Z');
await consume(c1.id, '19', '2026-08-20T07:00:00Z');
const c2 = await batch(coffee.id, { quantity: '50', totalPrice: '20.00', occurredAt: '2026-07-20T16:00:00Z' });
await consume(c2.id, '20', '2026-09-01T07:00:00Z');
await batch(coffee.id, { name: 'Offerta Esselunga', quantity: '10', totalPrice: '5.50', occurredAt: '2026-08-05T16:00:00Z' });
await batch(coffee.id, { name: 'Capsula singola', quantity: '1', totalPrice: '0.80', occurredAt: '2026-08-25T16:00:00Z' });
await batch(coffee.id, { refills: '3', unitPrice: '0.42', occurredAt: '2026-09-10T16:00:00Z' });
const c6 = await batch(coffee.id, { name: 'Scorta grande', quantity: '200', totalPrice: '64.00', occurredAt: '2026-09-25T16:00:00Z' });

// Sigarette: the most recent pack is finished (7 + 13 of a 20-pack at 6.50), the older one is not.
const cigarettes = await substance({ name: 'Sigarette', unit: 'sigaretta', refillQuantity: '20' });
const s1 = await batch(cigarettes.id, { quantity: '20', totalPrice: '6.20', occurredAt: '2026-08-01T10:00:00Z' });
await consume(s1.id, '7', '2026-08-02T20:00:00Z');
await consume(s1.id, '5', '2026-08-03T20:00:00Z');
const s2 = await batch(cigarettes.id, { quantity: '20', totalPrice: '6.50', occurredAt: '2026-09-20T10:00:00Z' });
await consume(s2.id, '7', '2026-09-21T20:00:00Z');
await consume(s2.id, '13', '2026-09-23T20:00:00Z');

// Erba: decimal quantities and an adjustment.
const weed = await substance({ name: 'Erba', unit: 'g' });
const w1 = await batch(weed.id, { quantity: '5', totalPrice: '50.00', occurredAt: '2026-08-10T18:00:00Z' });
await consume(w1.id, '0.5', '2026-08-11T21:00:00Z');
await consume(w1.id, '0.25', '2026-08-12T21:00:00Z');
await consume(w1.id, '1.2', '2026-08-20T21:00:00Z');
await adjust(w1.id, '0.15', 'Ripesata: la bilancia segnava meno', '2026-08-21T10:00:00Z');
const w2 = await batch(weed.id, { quantity: '3.5', totalPrice: '35.00', occurredAt: '2026-09-15T18:00:00Z' });
await consume(w2.id, '0.3', '2026-09-16T21:00:00Z');

// Birra: its only batch is finished (stock 0, avg "—") and it has one-time consumptions (not in stock).
const beer = await substance({ name: 'Birra', unit: 'bottiglia', refillQuantity: '6' });
const b1 = await batch(beer.id, { name: 'Peroni 6-pack', refills: '1', totalPrice: '7.20', occurredAt: '2026-09-05T17:00:00Z' });
await consume(b1.id, '2', '2026-09-06T19:00:00Z');
await consume(b1.id, '4', '2026-09-12T19:00:00Z');
await oneTime(beer.id, { name: 'Pinta al pub', quantity: '1', totalPrice: '5.00', occurredAt: '2026-09-13T21:00:00Z' });
await oneTime(beer.id, { name: 'Bar sotto casa', quantity: '2', unitPrice: '4.50', occurredAt: '2026-09-20T19:00:00Z' });
await oneTime(beer.id, { quantity: '1', totalPrice: '6.00', occurredAt: '2026-09-26T22:00:00Z' });

// Tè verde: no batches at all ("—" everywhere, empty bar).
await substance({ name: 'Tè verde', unit: 'bustina' });

// A very long name and a huge price (layout at 390 px).
const whisky = await substance({
  name: "Whisky torbato single malt dell'isola di Islay, invecchiato diciotto anni in botti di sherry",
  unit: 'ml',
});
const k1 = await batch(whisky.id, { name: 'Bottiglia regalo', quantity: '700', totalPrice: '1234.56', occurredAt: '2026-09-01T12:00:00Z' });
await consume(k1.id, '40', '2026-09-02T22:00:00Z');

// Energy drink: archived, so it must not appear in the list (movements first: archived is read-only).
const energy = await substance({ name: 'Energy drink', unit: 'lattina' });
const e1 = await batch(energy.id, { quantity: '4', totalPrice: '6.00', occurredAt: '2026-07-10T09:00:00Z' });
await consume(e1.id, '1', '2026-07-11T09:00:00Z');
await call('PATCH', `/substances/${energy.id}`, { archived: true });

// Consumptions page. Sigarette: four packs in July, each finished over 4-5 evenings (3 to 12 a
// time; the price goes from 6.00 to 6.20), so it has more than 20 consumptions.
const julyPacks = [
  { totalPrice: '6.00', occurredAt: '2026-07-01T09:00:00Z', uses: [['3', '07-01T19:00'], ['4', '07-02T20:00'], ['5', '07-03T21:00'], ['3', '07-04T19:30'], ['5', '07-05T22:00']] },
  { totalPrice: '6.00', occurredAt: '2026-07-06T09:00:00Z', uses: [['6', '07-06T20:00'], ['3', '07-07T21:00'], ['4', '07-08T20:00'], ['4', '07-09T22:30'], ['3', '07-10T20:00']] },
  { totalPrice: '6.20', occurredAt: '2026-07-12T10:00:00Z', uses: [['10', '07-12T20:00', 'Festa in terrazza'], ['4', '07-13T21:00'], ['3', '07-15T20:00'], ['3', '07-16T21:00']] },
  {
    totalPrice: '6.20',
    occurredAt: '2026-07-20T10:00:00Z',
    uses: [
      ['9', '07-20T20:00', 'Serata lunga al concerto: ne ho fumate più del solito, da tenere d\'occhio nelle prossime settimane perché è la terza volta questo mese che succede'],
      ['3', '07-22T21:00'],
      ['4', '07-25T20:00'],
      ['4', '07-28T21:30'],
    ],
  },
];
for (const pack of julyPacks) {
  const p = await batch(cigarettes.id, { quantity: '20', totalPrice: pack.totalPrice, occurredAt: pack.occurredAt });
  for (const [quantity, when, note] of pack.uses) await consume(p.id, quantity, `2026-${when}:00Z`, note);
}
// A free cigarette (one-time at 0.00): the next consumption has no price delta.
await oneTime(cigarettes.id, { name: 'Offerta da un amico', quantity: '1', totalPrice: '0.00', occurredAt: '2026-08-05T23:00:00Z', note: 'Al bar, dopo cena' });
await consume(s1.id, '4', '2026-08-06T20:00:00Z');
// A cancelled consumption: it must appear nowhere and never count as "previous".
const cancelled = await consume(s1.id, '2', '2026-08-07T20:00:00Z');
await call('DELETE', `/consumptions/${cancelled.id}`);

// Caffè: the last days of September, from two batches at different prices, none finished.
await consume(c2.id, '2', '2026-09-26T07:00:00Z');
await consume(c2.id, '3', '2026-09-27T07:30:00Z');
await consume(c6.id, '2', '2026-09-28T06:45:00Z');
await consume(c6.id, '1', '2026-09-29T07:00:00Z');

const listed = await call('GET', '/substances');
console.log(`Demo data: ${listed.length} substances listed (+1 archived): ${listed.map((s) => s.name.slice(0, 20)).join(', ')}`);
const consumptions = await call('GET', '/consumptions?limit=200');
console.log(`Demo data: ${consumptions.length} consumptions (batch and one-time)`);
