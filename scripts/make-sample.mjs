// Writes data/sample.geojson: made-up bars in the crawl's format, used only
// until the real data/happy_hours.geojson exists. The site labels it as sample data.
import { writeFileSync } from 'node:fs';

const wk = ['mon', 'tue', 'wed', 'thu', 'fri'];
const v = (id, name, neighborhood, lat, lng, venue_type, windows, deals) => ({ id, name, neighborhood, lat, lng, venue_type, windows, deals });
const d = (category, item, price, text, kind = price == null ? null : 'flat_price') => ({ category, item, price, text, kind });

const venues = [
  v('sample-copper', 'The Copper Tap', 'Cardozo/Shaw', 38.9128, -77.0219, 'bar', [{ days: wk, start: '16:00', end: '19:00', area: 'bar and patio' }],
    [d('beer', 'Drafts', 5, '$5 drafts'), d('cocktail', 'House cocktails', 7, '$7 house cocktails'), d('food', 'Wings', null, 'Half-off wings', 'half_off')]),
  v('sample-rooftop', 'Rooftop Fourteen', 'U Street', 38.9170, -77.0316, 'bar', [{ days: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'], start: '17:00', end: '20:00', area: 'rooftop only' }],
    [d('wine', 'Wine by the glass', 6, '$6 wine'), d('cocktail', 'Spritzes', 8, '$8 spritzes')]),
  v('sample-anacostia', 'Anacostia Ale Works', 'Navy Yard', 38.8762, -77.0035, 'restaurant', [{ days: ['mon', 'tue', 'wed', 'thu'], start: '15:00', end: '18:30', area: null }],
    [d('beer', 'House pints', 4, '$4 house pints'), d('beer', 'Flights', 2, '$2 off flights', 'dollars_off')]),
  v('sample-dupont', 'Dupont Wine Room', 'Dupont Circle', 38.9105, -77.0440, 'bar', [{ days: wk, start: '17:00', end: '19:00', area: 'bar only' }],
    [d('wine', 'Selected pours', 7, '$7 pours'), d('food', 'Cheese board', 12, '$12 cheese board')]),
  v('sample-lincoln', 'Lincoln Park Tavern', 'Capitol Hill', 38.8893, -76.9905, 'bar',
    [{ days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '16:00', end: '19:00', area: null }, { days: ['sun', 'mon', 'tue', 'wed', 'thu'], start: '22:00', end: null, end_label: 'close', area: null }],
    [d('beer', 'Domestic cans', 3, '$3 cans'), d('spirits', 'Rail drinks', 5, '$5 rail drinks')]),
  v('sample-columbia', 'Columbia Road Social', 'Adams Morgan', 38.9216, -77.0425, 'bar', [{ days: ['mon', 'tue', 'wed', 'thu'], start: '19:00', end: '21:00', area: 'bar only' }],
    [d('cocktail', 'Classic cocktails', 9, '$9 classics')]),
  v('sample-penn', 'Penn Quarter Taproom', 'Penn Quarter', 38.8970, -77.0230, 'bar', [{ days: wk, start: '16:00', end: '19:00', area: null }],
    [d('beer', 'Local drafts', 5, '$5 local drafts'), d('food', 'Sliders', 6, '$6 sliders')]),
  v('sample-hstreet', 'H Street Hideaway', 'Near Northeast', 38.9002, -76.9880, 'bar', [{ days: ['wed', 'thu', 'fri', 'sat'], start: '22:00', end: null, end_label: 'close', area: null }],
    [d('spirits', 'Well drinks', 6, '$6 well drinks'), d('cocktail', 'Frozen drink', 8, '$8 frozen drink')]),
  v('sample-pier', 'Pier Seven Oyster Bar', 'Southwest Waterfront', 38.8790, -77.0240, 'restaurant', [{ days: wk, start: '15:00', end: '18:00', area: 'bar and patio' }],
    [d('food', 'Raw oysters', 1, '$1 oysters'), d('wine', 'Sparkling', 6, '$6 sparkling')]),
  v('sample-canal', 'Canal House', 'Georgetown', 38.9050, -77.0630, 'restaurant', [{ days: wk, start: '17:00', end: '19:00', area: 'bar only' }],
    [d('beer', 'Pints', 6, '$6 pints'), d('wine', 'House wine', 6, '$6 house wine'), d('food', 'Flatbreads', 8, '$8 flatbreads')]),
  v('sample-logan', 'Logan Lounge', 'Logan Circle/Shaw', 38.9093, -77.0300, 'bar', [{ days: wk, start: '16:30', end: '19:30', area: null }],
    [d('cocktail', 'Martinis', null, 'Half-price martinis', 'half_off'), d('wine', 'Prosecco', 7, '$7 prosecco')]),
  v('sample-chinatown', 'Gallery Place Pub', 'Chinatown', 38.8990, -77.0215, 'bar', [{ days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '21:00', end: '23:00', area: null }],
    [d('beer', 'Drafts', 4, '$4 drafts'), d('spirits', 'Shots', 4, '$4 shots')])
];

const fc = {
  type: 'FeatureCollection',
  sample: true,
  features: venues.map((x) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [x.lng, x.lat] },
    properties: {
      ...x, status: 'has_happy_hour', summary: x.deals.map((y) => y.text).join(', '),
      source_url: null, last_verified: '2026-10-19', confidence: 'low', sample: true
    }
  }))
};
writeFileSync(new URL('../data/sample.geojson', import.meta.url), JSON.stringify(fc, null, 1));
console.log(`wrote ${fc.features.length} sample venues`);
