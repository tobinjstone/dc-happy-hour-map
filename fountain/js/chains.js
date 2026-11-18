// The chains on the map: each pours Coca-Cola on its fountains, so Diet Coke
// is there unless a store says otherwise. Checked November 2026 against the
// chains' own pages, their bottlers' announcements and news coverage; each
// entry links its main source.
//
// pours: 'coke' or 'both' (Coke and Pepsi side by side)
// freestyle: whether Coca-Cola Freestyle touchscreen machines are at 'most'
//   or 'some' stores, or 'no'/'unknown'
// confidence: how sure the chain-wide answer is ('high' or 'medium')
// spiders: the All The Places scrapers that list the chain's stores
//   (scripts/fetch-fountains.mjs reads these)

const DAILY_MEAL = 'https://www.thedailymeal.com/2125011/fast-food-restaurant-diet-cokes-ranked';
const RBI = 'https://www.rbi.com/English/news/news-details/2023/Burger-King-Popeyes-Firehouse-Subs-and-Tim-Hortons-Renew-Long-Standing-U.S.-Relationship-with-The-Coca-Cola-Company-a9cef0baa/default.aspx';
const AND_A_COKE = 'https://www.coca-colacompany.com/media-center/coca-cola-brings-13-iconic-restaurants-together-in-and-a-coke-campaign';

export const CHAINS = {
  mcdonalds: {
    name: "McDonald's", short: 'McD', spiders: ['mcdonalds'], pours: 'coke', freestyle: 'some', confidence: 'high',
    note: 'McDonald\'s says it pre-chills the syrup and the filtered water, sets the syrup ratio to allow for melting ice, and uses a slightly wider straw. The Daily Meal ranked its fountain Diet Coke the best in fast food (March 2026).',
    source: 'https://www.mcdonalds.com/us/en-us/faq/36201-why-does-coca-cola-taste-so-good-at-mcdonalds.html'
  },
  chick_fil_a: {
    name: 'Chick-fil-A', short: 'CFA', spiders: ['chick_fil_a'], pours: 'coke', freestyle: 'no', confidence: 'high',
    note: 'Fountain drinks are Coca-Cola products. Closed Sundays.',
    source: 'https://www.chick-fil-a.com/menu-items/coca-cola'
  },
  wendys: {
    name: "Wendy's", short: 'WEN', spiders: ['wendys'], pours: 'coke', freestyle: 'most', confidence: 'high',
    note: 'Most US Wendy\'s pour from Freestyle machines. Ranked third for fountain Diet Coke by The Daily Meal (March 2026).',
    source: AND_A_COKE
  },
  burger_king: {
    name: 'Burger King', short: 'BK', spiders: ['burger_king'], pours: 'coke', freestyle: 'some', confidence: 'high',
    note: 'Burger King\'s Coca-Cola deal runs to 2033.',
    source: RBI
  },
  five_guys: {
    name: 'Five Guys', short: '5GUYS', spiders: ['five_guys_us'], pours: 'coke', freestyle: 'most', confidence: 'high',
    note: 'Serves Coca-Cola and Dr Pepper products, mostly from Freestyle machines.',
    source: 'https://www.fiveguys.com/menu/drinks'
  },
  sonic: {
    name: 'Sonic', short: 'SONIC', spiders: ['sonic_drivein_us'], pours: 'coke', freestyle: 'no', confidence: 'high',
    note: 'Nugget ice, and drinks are mixed to order.',
    source: 'https://www.ana.net/magazines/show/id/news-2025-11-03-sonic-coca-cola-your-way'
  },
  seven_eleven: {
    name: '7-Eleven', short: '7-11', spiders: ['seven_eleven_ca_us'], pours: 'both', freestyle: 'unknown', confidence: 'medium',
    note: 'Big Gulp fountains in the area list Diet Coke (sometimes caffeine-free too) next to Diet Pepsi, but each store picks its own lineup.',
    source: 'https://www.yelp.com/menu/7-eleven-gaithersburg'
  },
  wawa: {
    name: 'Wawa', short: 'WAWA', spiders: ['wawa'], pours: 'coke', freestyle: 'most', confidence: 'medium',
    note: 'Wawa put Freestyle machines in every store by 2015.',
    source: 'https://www.bevnet.com/news/2014/wawa-to-feature-coca-cola-freestyle-machines-in-all-locations'
  },
  sheetz: {
    name: 'Sheetz', short: 'SHEETZ', spiders: ['sheetz'], pours: 'both', freestyle: 'unknown', confidence: 'medium',
    note: 'Sheetz fountains carry both Pepsi and Coca-Cola.',
    source: 'https://en.wikipedia.org/wiki/Sheetz'
  },
  chipotle: {
    name: 'Chipotle', short: 'CHIP', spiders: ['chipotle'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: 'Ranked second for fountain Diet Coke by The Daily Meal (March 2026), which found it still fizzy after half an hour.',
    source: DAILY_MEAL
  },
  firehouse_subs: {
    name: 'Firehouse Subs', short: 'FIRE', spiders: ['firehouse_subs'], pours: 'coke', freestyle: 'most', confidence: 'high',
    note: 'Freestyle machines in every restaurant since 2011.',
    source: RBI
  },
  popeyes: {
    name: 'Popeyes', short: 'POP', spiders: ['popeyes'], pours: 'coke', freestyle: 'some', confidence: 'high',
    note: '', source: RBI
  },
  raising_canes: {
    name: "Raising Cane's", short: 'CANE', spiders: ['raising_canes_us'], pours: 'coke', freestyle: 'some', confidence: 'medium',
    note: 'Poured over nugget ice. Ranked fourth for fountain Diet Coke by The Daily Meal (March 2026).',
    source: DAILY_MEAL
  },
  wingstop: {
    name: 'Wingstop', short: 'WING', spiders: ['wingstop'], pours: 'coke', freestyle: 'some', confidence: 'high',
    note: '', source: AND_A_COKE
  },
  moes: {
    name: "Moe's Southwest Grill", short: "MOE'S", spiders: ['moes_southwest_grill'], pours: 'coke', freestyle: 'most', confidence: 'medium',
    note: 'Freestyle machines in every Moe\'s since 2012.',
    source: 'https://www.moes.com/media/coca-cola-freestyle-in-every-location'
  },
  qdoba: {
    name: 'Qdoba', short: 'QDOBA', spiders: ['qdoba'], pours: 'coke', freestyle: 'some', confidence: 'medium',
    note: 'Qdoba\'s menu says "most" of its restaurants serve Coca-Cola products.',
    source: 'https://catering.qdoba.com/index.cfm?fuseaction=item&item-id=1470&restrictByDayPart=false'
  },
  shake_shack: {
    name: 'Shake Shack', short: 'SHACK', spiders: ['shake_shack'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: 'US menus list Coke, Diet Coke and Coke Zero Sugar.',
    source: 'https://www.flystl.com/wp-content/uploads/2025/09/STL-Shake-Shack-Menu-Boards_082925.pdf'
  },
  arbys: {
    name: "Arby's", short: 'ARBY', spiders: ['arbys_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Switched from Pepsi to Coke in 2018. Ranked fifth for fountain Diet Coke by The Daily Meal (March 2026).',
    source: 'https://www.qsrweb.com/news/arbys-fully-transitioned-to-coke/'
  },
  panda_express: {
    name: 'Panda Express', short: 'PANDA', spiders: ['panda_express'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Switched from Pepsi to Coke in 2019.',
    source: AND_A_COKE
  },
  jimmy_johns: {
    name: "Jimmy John's", short: 'JJ', spiders: ['jimmy_johns_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: '', source: AND_A_COKE
  },
  potbelly: {
    name: 'Potbelly', short: 'POTB', spiders: ['potbelly_sandwich_shop'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://www.restaurantbusinessonline.com/food/potbelly-expands-core-menu-without-overcomplicating-things'
  },
  noodles: {
    name: 'Noodles & Company', short: 'NOOD', spiders: ['noodles_and_company_us'], pours: 'coke', freestyle: 'most', confidence: 'medium',
    note: 'Put Freestyle machines in across the US in 2012.',
    source: 'https://prnewswire.com/news-releases/noodles--company-to-launch-coca-cola-freestyle-across-the-us-138315704.html'
  },
  smashburger: {
    name: 'Smashburger', short: 'SMASH', spiders: ['smashburger'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://www.doordash.com/store/smashburger-wheat-ridge-185579'
  },
  checkers: {
    name: "Checkers & Rally's", short: 'CHKR', spiders: ['checkers_and_rallys_us'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://places.singleplatform.com/checkers-drive-in-restaurant-21/menu'
  },
  zaxbys: {
    name: "Zaxby's", short: 'ZAX', spiders: ['zaxbys_us'], pours: 'coke', freestyle: 'most', confidence: 'medium',
    note: 'Freestyle machines since 2013.',
    source: 'https://www.restaurantnews.com/a-classic-partnership-refreshed-zaxbys-renews-beverage-agreement-with-coca-cola'
  },
  costco: {
    name: 'Costco food court', short: 'COSTCO', spiders: ['costco_ca_gb_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Costco food courts switched from Pepsi to Coca-Cola between July 2025 and early 2026, Diet Coke included.',
    source: 'https://finance.yahoo.com/news/costco-switches-food-court-back-192106114.html'
  },
  amc: {
    name: 'AMC Theatres', short: 'AMC', spiders: ['amc_theatres_us'], pours: 'coke', freestyle: 'most', confidence: 'high',
    note: 'AMC put Freestyle machines in all its US theatres.',
    source: 'https://www.sec.gov/Archives/edgar/data/0001411579/000141157917000021/amc-20161231x10k.htm'
  },
  cinemark: {
    name: 'Cinemark', short: 'CNMK', spiders: ['cinemark'], pours: 'coke', freestyle: 'some', confidence: 'high',
    note: 'Free same-day refill on a large fountain drink.',
    source: 'https://www.cinemark.com/concessions-and-snacks'
  },
  dennys: {
    name: "Denny's", short: 'DEN', spiders: ['dennys_us'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://www.dennys.com/slammin-sodas-our-take-dirty-soda'
  },
  chilis: {
    name: "Chili's", short: 'CHILI', spiders: ['chilis'], pours: 'coke', freestyle: 'some', confidence: 'medium',
    note: 'Free refills on fountain drinks.',
    source: 'https://www.flychicago.com/SiteCollectionDocuments/O%27Hare/ArchivedPDFs/ServicesAmenities/Menus/ORD%20Chilis_T2%20Menu%20Poster_102025.pdf'
  },
  red_robin: {
    name: 'Red Robin', short: 'RR', spiders: ['red_robin'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Diet Coke is on the bottomless (free refill) list.',
    source: 'https://www.redrobin.com/menu/bottomless/soft-drinks'
  },
  olive_garden: {
    name: 'Olive Garden', short: 'OG', spiders: ['olive_garden'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://www.thedailymeal.com/1459411/does-olive-garden-sell-coke-or-pepsi'
  },
  outback: {
    name: 'Outback Steakhouse', short: 'OUTBK', spiders: ['outback_steakhouse'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: '', source: 'https://www.outback.com/offers/aussie-early-dine'
  }
};

// Places visitors add: an independent pizza place, a deli, a diner.
export const SPOT = { name: 'Local spot', short: '★', spot: true, pours: null };

export const POURS = {
  coke: { pill: 'Chain pours Coke', fact: 'Coca-Cola fountain', usually: 'Usually a Coca-Cola fountain' },
  both: { pill: 'Coke and Pepsi', fact: 'Coca-Cola and Pepsi fountains', usually: 'Usually Coke and Pepsi fountains' }
};

export const FREESTYLE = { most: 'Freestyle machines at most stores', some: 'Freestyle machines at some stores' };

// Left off the map: they pour Pepsi, or have no fountain at all.
export const NOT_HERE = [
  { name: 'Subway', why: 'Pepsi since 2025', source: 'https://newsroom.subway.com/2024-03-19-Subway-R-Selects-PepsiCo-as-its-Beverage-Partner-in-the-U-S' },
  { name: "Jersey Mike's", why: 'Pepsi', source: 'https://www.spokesman.com/stories/2026/oct/15/kfc-picks-coca-cola-as-us-soda-supplier-ditches-lo/' },
  { name: 'KFC', why: 'Pepsi until it switches to Coke in early 2027', source: 'https://www.cnbc.com/2026/10/15/kfc-coca-cola-pepsi-switch.html' },
  { name: 'Taco Bell', why: 'Pepsi', source: 'https://www.pepsico.com/en/newsroom/press-releases/2026/pepsico-taco-bell-eleven-more-years-keep-mountain-dew-baja-blast-beverage-innovation-moving-forward' },
  { name: 'Pizza Hut', why: 'Pepsi', source: 'https://www.prnewswire.com/news-releases/pizza-hut-teams-up-with-pepsi-and-josh-allen-to-remind-fans-gameday-starts-with-the-hut-302858823.html' },
  { name: 'Panera', why: 'Pepsi', source: 'https://www.panerabread.com/en-us/press/press-room/panera-pepsi-and-starry-team-up-with-rugby-star-ilona-maher-for-summer-of-free-sips.html' },
  { name: 'Buffalo Wild Wings', why: 'Pepsi', source: 'https://tastingtable.com/1818074/what-fast-food-restaurants-serve-pepsi' },
  { name: "Applebee's", why: 'Pepsi', source: 'https://tastingtable.com/1818074/what-fast-food-restaurants-serve-pepsi' },
  { name: 'IHOP', why: 'Pepsi', source: 'https://pepsico.mediaroom.com/index.php?item=612&s=43' },
  { name: 'Bojangles', why: 'Pepsi', source: 'https://www.fdd.ninja/brands/bojangles/2025/under_conditions_exclusive_designation_pepsicola_company_beverage_supplier' },
  { name: 'Regal', why: 'Pepsi', source: 'https://variety.com/2020/film/news/regal-pepsi-coke-1203460427/' },
  { name: '&pizza', why: 'Pepsi', source: 'https://www.andpizza.com/menu' },
  { name: "Dunkin'", why: 'bottles and cans only', source: 'https://www.beverage-digest.com/articles/676-breaking-dunkin-swaps-coca-cola-products-for-pepsicos-in-us-restaurants' },
  { name: 'Cava', why: 'craft sodas on the fountain', source: 'https://cava.com/menu' }
];
