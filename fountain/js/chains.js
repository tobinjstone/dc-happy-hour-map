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
//   (scripts/fetch-fountains.mjs reads these); brand: keep only stores the
//   scraper tags with this brand, when one scraper covers sister brands

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
    name: '7-Eleven', short: '7-11', spiders: ['seven_eleven_ca_us'], brand: '7-Eleven', pours: 'both', freestyle: 'unknown', confidence: 'medium',
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
,
  whataburger: {
    name: 'Whataburger', short: 'WHATA', spiders: ['whataburger'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Mashed ranked Whataburger\'s fountain Coke the best of 12 chains (March 2026).',
    source: 'https://www.tastingtable.com/2229348/american-fast-food-chains-serve-coke-not-pepsi-2026/'
  },
  in_n_out: {
    name: 'In-N-Out', short: 'INOUT', spiders: ['innout'], pours: 'coke', freestyle: 'no', confidence: 'high',
    note: 'In-N-Out\'s own drinks list has Coke, Diet Coke and Cherry Coke.',
    source: 'https://www.in-n-out.com/docs/default-source/downloads/nutrition_info.pdf'
  },
  carls_jr: {
    name: "Carl's Jr.", short: 'CARLS', spiders: ['carls_jr_us'], pours: 'coke', freestyle: 'some', confidence: 'high',
    note: 'Ranked sixth for fountain Diet Coke by The Daily Meal (March 2026).',
    source: DAILY_MEAL
  },
  jack_in_the_box: {
    name: 'Jack in the Box', short: 'JACK', spiders: ['jack_in_the_box'], pours: 'coke', freestyle: 'most', confidence: 'high',
    note: 'Freestyle machines at most stores. Only some Jack in the Box locations are in the store data so far.',
    source: 'https://secure.businesswire.com/news/home/20250724372003/en/The-Fans-Have-Spoken-Jack-in-the-Box-Partners-with-Coca-Cola-to-Bring-Limited-Edition-Starlight-Drink-Back-to-Earth'
  },
  culvers: {
    name: "Culver's", short: 'CULV', spiders: ['culvers_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Switched from Pepsi to Coke in 2023.',
    source: 'https://www.fox6now.com/news/culvers-coca-cola-products-pepsi'
  },
  hardees: {
    name: "Hardee's", short: 'HARDEE', spiders: ['hardees_us'], pours: 'coke', freestyle: 'some', confidence: 'medium',
    note: '', source: 'https://thetakeout.com/every-fast-food-restaurant-drink-menu-coke-vs-pepsi-1850018235'
  },
  del_taco: {
    name: 'Del Taco', short: 'DEL', spiders: ['del_taco_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: '', source: 'https://deltaco.com/menu_items&category=drinks.html'
  },
  el_pollo_loco: {
    name: 'El Pollo Loco', short: 'EPL', spiders: ['el_pollo_loco'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: '', source: 'https://www.elpolloloco.com/our-food/sides-drinks-salsas/diet-coke'
  },
  steak_n_shake: {
    name: "Steak 'n Shake", short: 'SNS', spiders: ['steak_n_shake'], pours: 'coke', freestyle: 'some', confidence: 'medium',
    note: 'Also sells cane-sugar Coca-Cola in glass bottles since August 2025.',
    source: 'https://www.breitbart.com/politics/2025/07/17/maha-steak-n-shake-says-it-will-offer-coca-cola-with-real-cane-sugar'
  },
  white_castle: {
    name: 'White Castle', short: 'CASTLE', spiders: ['white_castle'], pours: 'coke', freestyle: 'most', confidence: 'high',
    note: 'Freestyle machines in nearly every restaurant since about 2017.',
    source: 'https://prnewswire.com/news-releases/white-castles-96-year-partnership-with-coca-cola-delivers-its-boldest-move-yet-300454740.html'
  },
  krystal: {
    name: 'Krystal', short: 'KRYS', spiders: ['krystal_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: '', source: 'https://www.krystal.com/menu'
  },
  churchs: {
    name: "Church's Texas Chicken", short: 'CHURCH', spiders: ['churchs_chicken_us'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: 'A Coca-Cola partner since 1952.',
    source: 'https://www.qsrmagazine.com/news/church-s-chicken-coca-cola-sign-8-year-deal'
  },
  pollo_tropical: {
    name: 'Pollo Tropical', short: 'POLLO', spiders: ['pollo_tropical_us'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://www.qsrweb.com/news/taco-cabana-pollo-tropical-sign-multi-year-deal-with-coca-cola/'
  },
  portillos: {
    name: "Portillo's", short: 'PORT', spiders: ['portillos'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://www.portillos.com/faq'
  },
  wienerschnitzel: {
    name: 'Wienerschnitzel', short: 'WIENER', spiders: ['wienerschnitzel_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: '', source: 'https://www.wienerschnitzel.com/food-category/drinks/'
  },
  mod_pizza: {
    name: 'MOD Pizza', short: 'MOD', spiders: ['mod_pizza'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Fountain sodas from Coca-Cola and Dr Pepper.',
    source: 'https://modpizza.com/menu/'
  },
  waffle_house: {
    name: 'Waffle House', short: 'WAFFLE', spiders: ['waffle_house_us'], pours: 'coke', freestyle: 'no', confidence: 'high',
    note: 'Has poured Coca-Cola since it opened in 1955.',
    source: 'https://www.ajc.com/business/2025/09/despite-many-late-nights-waffle-house-still-looking-good-at-70'
  },
  cracker_barrel: {
    name: 'Cracker Barrel', short: 'BARREL', spiders: ['cracker_barrel_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Diet Coke comes with bottomless refills.',
    source: 'https://www.crackerbarrel.com/menupdfs/STORE_347_LD_MENU_EN.pdf'
  },
  golden_corral: {
    name: 'Golden Corral', short: 'CORRAL', spiders: ['golden_corral'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Switched from Pepsi to Coke in 2017.',
    source: 'https://www.franchising.com/news/20170920_golden_corral_announces_partnership_with_the_cocac.html'
  },
  tgi_fridays: {
    name: 'TGI Fridays', short: 'TGIF', spiders: ['tgi_fridays_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: 'Free refills on fountain drinks.',
    source: 'https://tgifridays.com/wp-content/uploads/2025/05/Large-Format_Q2-2025_05132025.pdf'
  },
  ruby_tuesday: {
    name: 'Ruby Tuesday', short: 'RUBY', spiders: ['ruby_tuesday_us'], pours: 'coke', freestyle: 'unknown', confidence: 'high',
    note: '', source: 'https://www.rubytuesday.com/menu'
  },
  cheesecake_factory: {
    name: 'The Cheesecake Factory', short: 'TCF', spiders: ['the_cheesecake_factory'], pours: 'coke', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://thetakeout.com/every-fast-food-restaurant-drink-menu-coke-vs-pepsi-1850018235'
  },
  quiktrip: {
    name: 'QuikTrip', short: 'QT', spiders: ['quiktrip_us'], pours: 'both', freestyle: 'no', confidence: 'medium',
    note: 'Fountains carry all the major brands, with crushed or cubed ice.',
    source: 'https://nacsmagazine.com/issues/march-2025/finding-new-opportunities-for-fountain-drinks'
  },
  speedway: {
    name: 'Speedway', short: 'SPDWY', spiders: ['speedway_us'], pours: 'both', freestyle: 'unknown', confidence: 'high',
    note: 'Speedway lists both Diet Coke and Diet Pepsi fountain drinks.',
    source: 'https://www.speedway.com/in-store/cold-beverages/fountaindrinks/diet-coke'
  },
  caseys: {
    name: "Casey's", short: 'CASEYS', spiders: ['caseys_general_store_us'], pours: 'both', freestyle: 'unknown', confidence: 'medium',
    note: '', source: 'https://blog.caseys.com/articles/the-best-fountain-drink-combinations'
  },
  racetrac: {
    name: 'RaceTrac', short: 'RACE', spiders: ['race_trac_us'], pours: 'both', freestyle: 'unknown', confidence: 'medium',
    note: 'RaceTrac lists Diet Coke and Diet Pepsi on its fountains.',
    source: 'https://www.racetrac.com/food-beverages/fountain-drinks'
  },
  bb_theatres: {
    name: 'B&B Theatres', short: 'B&B', spiders: ['bb_theatres_us'], pours: 'coke', freestyle: 'most', confidence: 'high',
    note: 'Freestyle machines across the circuit since 2022.',
    source: 'https://www.boxofficepro.com/bb-theatres-coca-cola-company-10-year-contract/'
  }
};

// Places visitors add: an independent pizza place, a deli, a diner.
export const SPOT = { name: 'Local spot', short: '★', spot: true, pours: null };

export const POURS = {
  coke: { pill: 'Chain pours Coke', fact: 'Coca-Cola fountain', usually: 'Usually a Coca-Cola fountain' },
  both: { pill: 'Coke and Pepsi', fact: 'Coca-Cola and Pepsi fountains', usually: 'Usually Coke and Pepsi fountains' }
};

export const FREESTYLE = { most: 'Freestyle machines at most stores', some: 'Freestyle machines at some stores' };

// Left off the map: they pour Pepsi (why: any extra word on that), or have
// no fountain at all (none: what they sell instead).
const TASTING_TABLE_PEPSI = 'https://tastingtable.com/1818074/what-fast-food-restaurants-serve-pepsi';
export const NOT_HERE = [
  { name: 'Subway', why: 'since 2025', source: 'https://newsroom.subway.com/2024-03-19-Subway-R-Selects-PepsiCo-as-its-Beverage-Partner-in-the-U-S' },
  { name: "Jersey Mike's", source: 'https://www.spokesman.com/stories/2026/oct/15/kfc-picks-coca-cola-as-us-soda-supplier-ditches-lo/' },
  { name: 'KFC', why: 'until it switches to Coke in early 2027', source: 'https://www.cnbc.com/2026/10/15/kfc-coca-cola-pepsi-switch.html' },
  { name: 'Taco Bell', source: 'https://www.pepsico.com/en/newsroom/press-releases/2026/pepsico-taco-bell-eleven-more-years-keep-mountain-dew-baja-blast-beverage-innovation-moving-forward' },
  { name: 'Pizza Hut', source: 'https://www.prnewswire.com/news-releases/pizza-hut-teams-up-with-pepsi-and-josh-allen-to-remind-fans-gameday-starts-with-the-hut-302858823.html' },
  { name: 'Panera', source: 'https://www.panerabread.com/en-us/press/press-room/panera-pepsi-and-starry-team-up-with-rugby-star-ilona-maher-for-summer-of-free-sips.html' },
  { name: 'Buffalo Wild Wings', source: TASTING_TABLE_PEPSI },
  { name: "Applebee's", source: TASTING_TABLE_PEPSI },
  { name: 'IHOP', source: 'https://pepsico.mediaroom.com/index.php?item=612&s=43' },
  { name: 'Bojangles', source: 'https://www.fdd.ninja/brands/bojangles/2025/under_conditions_exclusive_designation_pepsicola_company_beverage_supplier' },
  { name: "Freddy's", source: 'https://www.freddys.com/blog/introducing-freddys-bevies' },
  { name: 'Golden Chick', source: 'https://www.goldenchick.com/menu/drinks/' },
  { name: "Taco John's", source: 'https://tacojohns.com/food-menu-category/beverages' },
  { name: "Captain D's", source: 'https://www.franchising.com/amp/news/20260623_captain_ds_and_pepsico_launch_alaska_family_cruise_sweepstakes_celebrating_.html' },
  { name: "Long John Silver's", source: 'https://a.storyblok.com/f/261627/x/730996bd77/ljs-nutrition-allergen-2026.pdf' },
  { name: 'Bob Evans', source: 'https://www.bobevans.com/menu/beverages' },
  { name: 'Huddle House', source: 'https://a.storyblok.com/f/140760/x/3d26059f12/160108-hh-nutritional-guide-august-2025-final.pdf' },
  { name: "BJ's Restaurant", source: 'https://bjsrestaurants.com/menu-item/diet-pepsi' },
  { name: 'Regal', source: 'https://variety.com/2020/film/news/regal-pepsi-coke-1203460427/' },
  { name: '&pizza', source: 'https://www.andpizza.com/menu' },
  { name: "Dunkin'", none: 'bottles and cans', source: 'https://www.beverage-digest.com/articles/676-breaking-dunkin-swaps-coca-cola-products-for-pepsicos-in-us-restaurants' },
  { name: 'Cava', none: 'craft sodas', source: 'https://cava.com/menu' }
];
