/* Al Thuraya Holding - Group Finance Portal: synthetic demonstration dataset.
   Every organisation, person, account and amount is fictitious and generated deterministically,
   with dates relative to today so the portal always looks current. */
(function (ns) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rnd = mulberry32(0x2026A7);
  const between = (min, max) => min + (max - min) * rnd();
  const int = (min, max) => Math.floor(between(min, max + 1));
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const chance = (p) => rnd() < p;
  const logUniform = (min, max) => Math.exp(between(Math.log(min), Math.log(max)));
  const money = (v) => Math.round(v * 100) / 100;
  const pad = (n, len) => String(n).padStart(len, '0');
  function weighted(pairs) {
    const total = pairs.reduce((sum, p) => sum + p[1], 0);
    let r = rnd() * total;
    for (const [value, weight] of pairs) {
      r -= weight;
      if (r <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
  const dayDiff = (a, b) => Math.round((b - a) / 86400000);
  const withTime = (d, hour, minute) => { const x = new Date(d); x.setHours(hour, minute, 0, 0); return x; };
  const isWeekend = (d) => d.getDay() === 5 || d.getDay() === 6; // Qatar working week is Sunday to Thursday
  const workday = (d) => { let x = new Date(d); while (isWeekend(x)) x = addDays(x, -1); return x; };

  const fiscalYear = today.getFullYear();
  const currentPeriod = today.getMonth();
  const daysInMonth = new Date(fiscalYear, currentPeriod + 1, 0).getDate();
  const elapsedPeriods = Math.max(currentPeriod, 1);

  const fx = { QAR: 1, USD: 3.64, EUR: 3.97 };

  const people = {
    persona: { id: 'u-mkuwari', name: 'Mariam Al-Kuwari', nameAr: 'مريم الكواري', title: 'Group Financial Controller', titleAr: 'المراقب المالي للمجموعة', account: 'THURAYA\\m.alkuwari', initials: 'MK' },
    cfo: { id: 'u-ksulaiti', name: 'Khalid Al-Sulaiti', nameAr: 'خالد السليطي', title: 'Group Chief Financial Officer', titleAr: 'الرئيس التنفيذي للشؤون المالية', initials: 'KS' },
    ceo: { id: 'u-hmuhannadi', name: 'Hamad Al-Muhannadi', nameAr: 'حمد المهندي', title: 'Group Chief Executive Officer', titleAr: 'الرئيس التنفيذي للمجموعة', initials: 'HM' },
    treasury: { id: 'u-nmannai', name: 'Noora Al-Mannai', nameAr: 'نورة المناعي', title: 'Head of Treasury', titleAr: 'رئيس الخزينة', initials: 'NM' },
    ap: { id: 'u-rmenon', name: 'Rajesh Menon', nameAr: 'راجيش مينون', title: 'Accounts Payable Manager', titleAr: 'مدير الذمم الدائنة', initials: 'RM' },
    budget: { id: 'u-femadi', name: 'Fatima Al-Emadi', nameAr: 'فاطمة العمادي', title: 'Head of Budgeting & Planning', titleAr: 'رئيس الموازنة والتخطيط', initials: 'FE' },
    audit: { id: 'u-swhitfield', name: 'Sarah Whitfield', nameAr: 'سارة ويتفيلد', title: 'Internal Audit Manager', titleAr: 'مدير التدقيق الداخلي', initials: 'SW' },
    procurement: { id: 'u-ohaddad', name: 'Omar Haddad', nameAr: 'عمر حداد', title: 'Group Procurement Manager', titleAr: 'مدير المشتريات للمجموعة', initials: 'OH' },
    credit: { id: 'u-dnair', name: 'Deepa Nair', nameAr: 'ديبا ناير', title: 'Credit & Collections Manager', titleAr: 'مدير الائتمان والتحصيل', initials: 'DN' },
    accountant: { id: 'u-jsantos', name: 'Joel Santos', nameAr: 'جويل سانتوس', title: 'Senior Accountant, Payables', titleAr: 'محاسب أول - الذمم الدائنة', initials: 'JS' }
  };

  const managers = [
    { id: 'u-amarri', name: 'Abdulla Al-Marri', nameAr: 'عبدالله المري', initials: 'AM' },
    { id: 'u-hkaabi', name: 'Hessa Al-Kaabi', nameAr: 'حصة الكعبي', initials: 'HK' },
    { id: 'u-mhajri', name: 'Mohammed Al-Hajri', nameAr: 'محمد الهاجري', initials: 'MH' },
    { id: 'u-jnaimi', name: 'Jassim Al-Naimi', nameAr: 'جاسم النعيمي', initials: 'JN' },
    { id: 'u-lsada', name: 'Latifa Al-Sada', nameAr: 'لطيفة السادة', initials: 'LS' },
    { id: 'u-aobaidli', name: 'Ahmed Al-Obaidli', nameAr: 'أحمد العبيدلي', initials: 'AO' },
    { id: 'u-vrao', name: 'Vikram Rao', nameAr: 'فيكرام راو', initials: 'VR' },
    { id: 'u-moconnor', name: "Michael O'Connor", nameAr: 'مايكل أوكونور', initials: 'MO' },
    { id: 'u-yansari', name: 'Yousef Al-Ansari', nameAr: 'يوسف الأنصاري', initials: 'YA' }
  ];

  const entities = [
    { id: 'ATH', code: '1000', name: 'Al Thuraya Holding', nameAr: 'الثريا القابضة', segment: 'Corporate', segmentAr: 'المركز الرئيسي', revenue: 48e6, opex: 31e6, profile: 'flat', color: '#8A1538', dso: 28 },
    { id: 'ATGH', code: '2000', name: 'Al Thuraya Grand Hotel & Resorts', nameAr: 'الثريا جراند للفنادق والمنتجعات', segment: 'Hospitality', segmentAr: 'الضيافة', revenue: 412e6, opex: 298e6, profile: 'hospitality', color: '#0E7C86', dso: 36 },
    { id: 'ATRE', code: '3000', name: 'Al Thuraya Real Estate Development', nameAr: 'الثريا للتطوير العقاري', segment: 'Real Estate', segmentAr: 'العقارات', revenue: 655e6, opex: 401e6, profile: 'realestate', color: '#B8925A', dso: 58 },
    { id: 'ATLG', code: '4000', name: 'Al Thuraya Logistics', nameAr: 'الثريا للخدمات اللوجستية', segment: 'Logistics', segmentAr: 'الخدمات اللوجستية', revenue: 236e6, opex: 189e6, profile: 'flat', color: '#23395D', dso: 52 },
    { id: 'ATFM', code: '5000', name: 'Al Thuraya Facilities Management', nameAr: 'الثريا لإدارة المرافق', segment: 'Services', segmentAr: 'الخدمات', revenue: 158e6, opex: 131e6, profile: 'flat', color: '#5B6B7A', dso: 71 },
    { id: 'ATTR', code: '6000', name: 'Al Thuraya Trading', nameAr: 'الثريا للتجارة', segment: 'Trading', segmentAr: 'التجارة', revenue: 297e6, opex: 258e6, profile: 'trading', color: '#C2456D', dso: 47 }
  ];

  const seasonality = {
    flat: [0.98, 0.96, 1.03, 1.0, 1.01, 0.97, 0.94, 0.95, 1.02, 1.04, 1.03, 1.07],
    hospitality: [1.28, 1.22, 1.16, 1.04, 0.92, 0.66, 0.58, 0.6, 0.84, 1.02, 1.21, 1.47],
    realestate: [0.94, 0.9, 1.18, 0.86, 0.92, 1.24, 0.88, 0.8, 1.12, 0.98, 0.96, 1.22],
    trading: [1.02, 0.97, 1.08, 1.12, 0.96, 0.9, 0.88, 0.92, 1.0, 1.04, 1.1, 1.21]
  };

  const costCentres = [
    ['CC-1100', 'ATH', 'Executive Office', 'المكتب التنفيذي', 18.5e6],
    ['CC-1200', 'ATH', 'Group Finance', 'الشؤون المالية للمجموعة', 14.2e6],
    ['CC-1300', 'ATH', 'Human Capital', 'الموارد البشرية', 9.8e6],
    ['CC-1400', 'ATH', 'Information Technology', 'تقنية المعلومات', 26.4e6],
    ['CC-1500', 'ATH', 'Legal & Compliance', 'الشؤون القانونية والامتثال', 7.1e6],
    ['CC-2100', 'ATGH', 'Rooms Division', 'قسم الغرف', 61.0e6],
    ['CC-2200', 'ATGH', 'Food & Beverage', 'الأغذية والمشروبات', 74.5e6],
    ['CC-2300', 'ATGH', 'Sales & Marketing', 'المبيعات والتسويق', 22.8e6],
    ['CC-2400', 'ATGH', 'Engineering & Maintenance', 'الهندسة والصيانة', 31.2e6],
    ['CC-3100', 'ATRE', 'Lusail Waterfront Towers (project)', 'مشروع أبراج الواجهة البحرية - لوسيل', 236.0e6],
    ['CC-3200', 'ATRE', 'Al Wakrah Residences (project)', 'مشروع مساكن الوكرة', 118.0e6],
    ['CC-3300', 'ATRE', 'Leasing & Asset Management', 'التأجير وإدارة الأصول', 19.6e6],
    ['CC-4100', 'ATLG', 'Fleet Operations', 'عمليات الأسطول', 58.3e6],
    ['CC-4200', 'ATLG', 'Warehousing & Cold Chain', 'المستودعات وسلسلة التبريد', 47.9e6],
    ['CC-5100', 'ATFM', 'Hard Services (MEP)', 'الخدمات الفنية الكهروميكانيكية', 52.4e6],
    ['CC-5200', 'ATFM', 'Soft Services', 'الخدمات العامة', 39.7e6],
    ['CC-6100', 'ATTR', 'Procurement & Imports', 'المشتريات والاستيراد', 142.0e6],
    ['CC-6200', 'ATTR', 'Retail Showrooms', 'صالات العرض', 36.5e6]
  ].map(([id, entity, name, nameAr, budget], index) => ({ id, entity, name, nameAr, budget, manager: managers[index % managers.length] }));

  const categories = {
    construction: { name: 'Construction & Fit-out', nameAr: 'الإنشاءات والتشطيبات', min: 180000, max: 4800000, terms: [60, 90], lines: ['Progress claim #{n} - podium and tower works', 'Variation order VO-{n} - facade glazing', 'Retention release (5%) - completed works', 'Fit-out works - level {n} common areas'] },
    it: { name: 'IT & Digital Services', nameAr: 'خدمات تقنية المعلومات', min: 18000, max: 920000, terms: [30, 45], lines: ['Managed security operations centre - monthly service', 'Network switches (48-port) x {n}', 'Endpoint protection licences - annual renewal', 'ERP support and enhancements - retainer', 'Data centre co-location - rack space and power'] },
    catering: { name: 'Catering & F&B Supplies', nameAr: 'التموين وإمدادات الأغذية', min: 9000, max: 260000, terms: [30], lines: ['Fresh produce - weekly delivery', 'Seafood supply - banquet operations', 'Staff catering - monthly service', 'Kitchen equipment spare parts'] },
    facilities: { name: 'Facilities & MEP', nameAr: 'المرافق والأعمال الكهروميكانيكية', min: 14000, max: 680000, terms: [45, 60], lines: ['Hard FM services - MEP planned maintenance', 'Chiller overhaul - plant room {n}', 'Landscaping and irrigation - monthly service', 'Cleaning and hygiene services - monthly', 'Water treatment chemicals and servicing'] },
    professional: { name: 'Professional Services', nameAr: 'الخدمات المهنية', min: 35000, max: 760000, terms: [30, 45], lines: ['Statutory audit FY{fy1} - final billing', 'Legal advisory - lease portfolio review', 'Tax advisory - transfer pricing documentation', 'Strategy advisory - hospitality asset review'] },
    logistics: { name: 'Logistics & Freight', nameAr: 'الشحن والخدمات اللوجستية', min: 12000, max: 420000, terms: [30, 45], lines: ['Container haulage - port to logistics park ({n} TEU)', 'Customs clearance and documentation', 'Cold-chain transport - weekly schedule', 'Freight forwarding - inbound consolidation'] },
    utilities: { name: 'Utilities & District Cooling', nameAr: 'المرافق العامة والتبريد المركزي', min: 60000, max: 1350000, terms: [30], lines: ['District cooling - consumption charges', 'District cooling - capacity charges', 'Electricity and water - common areas'] },
    marketing: { name: 'Marketing & Media', nameAr: 'التسويق والإعلام', min: 25000, max: 540000, terms: [45, 60], lines: ['Winter season campaign - digital media', 'Event production - corporate gala dinner', 'Brand photography - resort collateral', 'Outdoor signage - showroom launch'] },
    insurance: { name: 'Insurance', nameAr: 'التأمين', min: 85000, max: 1650000, terms: [30], lines: ['Property all-risk insurance - quarterly instalment', 'Group medical insurance - monthly premium', 'Fleet motor insurance - annual renewal', 'Contractor all-risk policy - project cover'] },
    fleet: { name: 'Fleet & Fuel', nameAr: 'الأسطول والوقود', min: 22000, max: 610000, terms: [30], lines: ['Fleet fuel cards - monthly statement', 'Vehicle lease - {n} light commercial vehicles', 'Heavy equipment rental - crawler crane', 'Lubricants and tyres - workshop stock'] },
    goods: { name: 'Trading Goods', nameAr: 'بضائع تجارية', min: 95000, max: 2900000, terms: [60, 90], lines: ['Home appliances - shipment {n}', 'Architectural lighting fixtures - order {n}', 'Steel reinforcement bars - {n} tonnes', 'Consumer electronics - quarterly stock order'] },
    supplies: { name: 'Operating Supplies', nameAr: 'المستلزمات التشغيلية', min: 6000, max: 190000, terms: [30, 45], lines: ['Guest room amenities', 'Linen and towels - rooms division', 'Office supplies - quarterly order', 'Uniforms - front-of-house staff'] }
  };

  const vendors = [
    ['Al Jassasiya Contracting W.L.L.', 'construction', 'Doha', 'QAR', ['ATRE', 'ATGH']],
    ['Lusail Facade Systems W.L.L.', 'construction', 'Lusail', 'QAR', ['ATRE']],
    ['Simaisma Electromechanical Contracting W.L.L.', 'facilities', 'Doha', 'QAR', ['ATFM', 'ATRE', 'ATGH']],
    ['Zekreet Marine & Civil Works W.L.L.', 'construction', 'Al Wakrah', 'QAR', ['ATRE']],
    ['Fuwairit Landscaping & Irrigation W.L.L.', 'facilities', 'Al Khor', 'QAR', ['ATRE', 'ATGH', 'ATFM']],
    ['Doha Digital Systems W.L.L.', 'it', 'Doha', 'QAR', ['ATH', 'ATGH', 'ATLG']],
    ['Gulf Secure Networks W.L.L.', 'it', 'Lusail', 'QAR', ['ATH']],
    ['Crestline Data Centre Services FZ-LLC', 'it', 'Dubai', 'USD', ['ATH']],
    ['Al Wakrah Fresh Produce Trading W.L.L.', 'catering', 'Al Wakrah', 'QAR', ['ATGH']],
    ['Pearl Coast Seafood W.L.L.', 'catering', 'Doha', 'QAR', ['ATGH']],
    ['Mesaieed Industrial Supplies W.L.L.', 'supplies', 'Mesaieed', 'QAR', ['ATLG', 'ATFM']],
    ['Umm Salal Hospitality Linen W.L.L.', 'supplies', 'Umm Salal', 'QAR', ['ATGH']],
    ['Al Khor Cold Chain Logistics W.L.L.', 'logistics', 'Al Khor', 'QAR', ['ATLG', 'ATTR']],
    ['Ras Bufontas Freight Forwarding W.L.L.', 'logistics', 'Doha', 'QAR', ['ATLG', 'ATTR']],
    ['Gulf Meridian Shipping Agencies W.L.L.', 'logistics', 'Doha', 'QAR', ['ATTR']],
    ['Dukhan Heavy Equipment Rental W.L.L.', 'fleet', 'Dukhan', 'QAR', ['ATRE', 'ATLG']],
    ['Al Rayyan Fuel & Lubricants W.L.L.', 'fleet', 'Al Rayyan', 'QAR', ['ATLG']],
    ['Desert Rose Fleet Leasing W.L.L.', 'fleet', 'Doha', 'QAR', ['ATLG', 'ATFM']],
    ['Crescent District Cooling Co. W.L.L.', 'utilities', 'Lusail', 'QAR', ['ATRE', 'ATGH']],
    ['West Bay Utilities Services W.L.L.', 'utilities', 'Doha', 'QAR', ['ATH', 'ATRE']],
    ['Al Fajer Takaful Insurance Q.P.S.C.', 'insurance', 'Doha', 'QAR', ['ATH', 'ATGH', 'ATRE', 'ATLG', 'ATFM', 'ATTR']],
    ['Gulf Shield Medical Insurance W.L.L.', 'insurance', 'Doha', 'QAR', ['ATH']],
    ['Hartwell & Partners (Qatar) LLC', 'professional', 'Doha', 'QAR', ['ATH']],
    ['Al Bayan Legal Consultants', 'professional', 'Doha', 'QAR', ['ATH', 'ATRE']],
    ['Corniche Tax Advisory LLC', 'professional', 'Doha', 'QAR', ['ATH']],
    ['Kestrel Strategy Partners Ltd', 'professional', 'London', 'USD', ['ATH', 'ATGH']],
    ['Al Corniche Creative Media W.L.L.', 'marketing', 'Doha', 'QAR', ['ATGH', 'ATTR']],
    ['Falcon Line Events & Exhibitions W.L.L.', 'marketing', 'Doha', 'QAR', ['ATGH', 'ATTR']],
    ['Banyan Print & Signage W.L.L.', 'marketing', 'Al Rayyan', 'QAR', ['ATGH', 'ATTR']],
    ['Bin Mahmoud Office Supplies W.L.L.', 'supplies', 'Doha', 'QAR', ['ATH', 'ATRE', 'ATLG']],
    ['Hilltop Kitchen Equipment Trading W.L.L.', 'catering', 'Doha', 'QAR', ['ATGH']],
    ['Onaiza Cleaning & Hygiene Services W.L.L.', 'facilities', 'Doha', 'QAR', ['ATFM', 'ATGH']],
    ['Nordhaven Hospitality Supplies GmbH', 'supplies', 'Munich', 'EUR', ['ATGH']],
    ['Aurelia Architectural Lighting S.p.A.', 'goods', 'Milan', 'EUR', ['ATTR', 'ATRE']],
    ['Kaimon Electronics Trading FZE', 'goods', 'Jebel Ali', 'USD', ['ATTR']],
    ['Gulf Timber & Joinery W.L.L.', 'construction', 'Mesaieed', 'QAR', ['ATRE']],
    ['Al Khulaifat Steel Trading W.L.L.', 'goods', 'Doha', 'QAR', ['ATRE', 'ATTR']],
    ['Qanat Water Technologies W.L.L.', 'facilities', 'Doha', 'QAR', ['ATFM']],
    ['Al Daayen Security Services W.L.L.', 'facilities', 'Al Daayen', 'QAR', ['ATFM', 'ATRE']],
    ['Bayt Al Tabakh Catering W.L.L.', 'catering', 'Doha', 'QAR', ['ATH', 'ATGH']],
    ['Orbis Cloud Solutions Pte. Ltd.', 'it', 'Singapore', 'USD', ['ATH']],
    ['Ras Abu Aboud Customs Brokers W.L.L.', 'logistics', 'Doha', 'QAR', ['ATTR', 'ATLG']]
  ].map(([name, category, city, currency, serves], index) => {
    const terms = pick(categories[category].terms);
    return {
      id: `V-${1001 + index}`,
      name, category, city, currency, serves, terms,
      cr: currency === 'QAR' ? `CR ${int(10421, 189765)}` : 'Foreign supplier',
      bank: currency === 'QAR' ? pick(['PNB', 'AMIB', 'GCB', 'AGTB']) : 'INTL',
      iban: currency === 'QAR' ? `QA•• •••• ${pad(int(1000, 9999), 4)}` : `•••• ${pad(int(1000, 9999), 4)}`,
      status: weighted([['active', 90], ['review', 7], ['blocked', 3]]),
      risk: weighted([['low', 70], ['medium', 24], ['high', 6]]),
      since: fiscalYear - int(1, 14),
      contact: pick(['Accounts Receivable Desk', 'Finance Manager', 'Collections Officer', 'Credit Controller'])
    };
  });
  vendors.find((v) => v.name.startsWith('Fuwairit')).status = 'review';

  const banks = [
    { id: 'PNB', name: 'Peninsula National Bank', nameAr: 'بنك شبه الجزيرة الوطني' },
    { id: 'AMIB', name: 'Al Majlis Islamic Bank', nameAr: 'مصرف المجلس الإسلامي' },
    { id: 'GCB', name: 'Gulf Commerce Bank', nameAr: 'بنك التجارة الخليجي' },
    { id: 'AGTB', name: 'Arabian Gulf Trust Bank', nameAr: 'بنك الخليج العربي للائتمان' },
    { id: 'INTL', name: 'International correspondent', nameAr: 'بنك مراسل دولي' }
  ];

  const accounts = [
    ['PNB', 'ATH', 'Main operating account', 'الحساب التشغيلي الرئيسي', 'QAR', 148250000, null],
    ['AMIB', 'ATH', 'Wakala deposit - 90 days', 'وديعة وكالة - 90 يوماً', 'QAR', 120000000, { rate: 5.15, maturity: 38 }],
    ['AMIB', 'ATH', 'Group payroll account (WPS)', 'حساب رواتب المجموعة (نظام حماية الأجور)', 'QAR', 52600000, null],
    ['PNB', 'ATGH', 'Hotel operating account', 'الحساب التشغيلي للفندق', 'QAR', 46870000, null],
    ['GCB', 'ATRE', 'Project escrow - Lusail Waterfront Towers', 'حساب الضمان - أبراج الواجهة البحرية', 'QAR', 93410000, null],
    ['GCB', 'ATRE', 'Real estate operating account', 'الحساب التشغيلي للعقارات', 'QAR', 38920000, null],
    ['AGTB', 'ATLG', 'Logistics operating account', 'الحساب التشغيلي للخدمات اللوجستية', 'QAR', 27640000, null],
    ['AGTB', 'ATTR', 'Trading operating account (USD)', 'الحساب التشغيلي للتجارة (دولار أمريكي)', 'USD', 9850000, null],
    ['PNB', 'ATFM', 'Facilities operating account', 'الحساب التشغيلي لإدارة المرافق', 'QAR', 21330000, null]
  ].map(([bank, entity, name, nameAr, currency, balance, deposit], index) => ({
    id: `ACC-${pad(index + 1, 2)}`, bank, entity, name, nameAr, currency, balance,
    balanceQar: money(balance * fx[currency]),
    iban: `QA•• ${bank.padEnd(4, 'X').slice(0, 4)} •••• ${pad(int(1000, 9999), 4)}`,
    rate: deposit ? deposit.rate : null,
    maturity: deposit ? iso(addDays(today, deposit.maturity)) : null,
    statement: iso(workday(addDays(today, -1))),
    trend: Array.from({ length: 12 }, (_, i) => money(balance * (0.86 + 0.14 * (i / 11)) * between(0.97, 1.03)))
  }));

  const monthly = {};
  const budgetPlan = {};
  entities.forEach((entity) => {
    const profile = seasonality[entity.profile];
    budgetPlan[entity.id] = profile.map((factor) => money((entity.revenue / 12) * factor));
    monthly[entity.id] = profile.slice(0, currentPeriod + 1).map((factor, m) => {
      const share = m === currentPeriod ? today.getDate() / daysInMonth : 1;
      const revenue = money((entity.revenue / 12) * factor * between(0.95, 1.05) * share);
      const opex = money((entity.opex / 12) * (0.62 + 0.38 * factor) * between(0.96, 1.04) * share);
      const budgetRevenue = money((entity.revenue / 12) * factor * share);
      return { month: m, revenue, opex, ebitda: money(revenue - opex), budgetRevenue, mtd: m === currentPeriod };
    });
  });

  const varianceFactors = [0.86, 0.91, 0.97, 1.02, 1.08, 0.79, 1.04, 0.94, 1.12, 0.99, 0.88, 1.05, 0.92, 0.83, 0.96, 1.01, 0.9, 1.07];
  costCentres.forEach((cc, index) => {
    cc.budgetYtd = money((cc.budget * elapsedPeriods) / 12);
    cc.actualYtd = money(cc.budgetYtd * varianceFactors[index % varianceFactors.length] * between(0.99, 1.01));
    cc.committed = money(Math.max(cc.budget - cc.actualYtd, 0) * between(0.07, 0.2));
    cc.forecast = money((cc.actualYtd / elapsedPeriods) * 12 * between(0.98, 1.02));
  });

  const chainFor = (amountQar) => (amountQar <= 50000 ? ['ccm'] : amountQar <= 500000 ? ['ccm', 'fc'] : amountQar <= 2500000 ? ['ccm', 'fc', 'cfo'] : ['ccm', 'fc', 'cfo', 'ceo']);
  const approverFor = (role, cc) => (role === 'ccm' ? cc.manager : role === 'fc' ? people.persona : role === 'cfo' ? people.cfo : people.ceo);
  const holdReasons = [
    ['Price variance against PO exceeds 2% tolerance', 'فرق السعر عن أمر الشراء يتجاوز حد التفاوت 2%'],
    ['Goods received note (GRN) not yet posted', 'لم يتم ترحيل إشعار استلام البضائع بعد'],
    ['Supplier bank details under verification', 'بيانات حساب المورد قيد التحقق'],
    ['Possible duplicate of an earlier invoice', 'احتمال تكرار فاتورة سابقة']
  ];

  const invoices = [];
  let apSequence = 1520;
  for (let i = 0; i < 268; i++) {
    const vendor = pick(vendors);
    const category = categories[vendor.category];
    const entityId = pick(vendor.serves);
    const centres = costCentres.filter((c) => c.entity === entityId);
    const cc = pick(centres);
    const invoiceDate = workday(addDays(today, -int(1, 150)));
    const amountQar = money(Math.round(logUniform(category.min, category.max) / 10) * 10 + (chance(0.35) ? int(1, 99) / 100 : 0));
    const amount = money(amountQar / fx[vendor.currency]);
    const due = addDays(invoiceDate, vendor.terms);
    const age = dayDiff(invoiceDate, today);
    let status;
    if (age < 6) status = 'pending';
    else if (age < 18) status = weighted([['pending', 52], ['approved', 30], ['scheduled', 8], ['hold', 6], ['disputed', 4]]);
    else if (due < addDays(today, -30)) status = weighted([['paid', 91], ['disputed', 4], ['hold', 3], ['approved', 2]]);
    else if (due < today) status = weighted([['paid', 58], ['approved', 14], ['scheduled', 16], ['hold', 6], ['disputed', 6]]);
    else status = weighted([['approved', 32], ['scheduled', 24], ['paid', 34], ['pending', 6], ['hold', 4]]);

    const roles = chainFor(amountQar);
    let current = -1;
    if (status === 'pending') {
      current = roles.length >= 2 && chance(0.62) ? 1 : 0;
      if (roles.length >= 3 && current === 1 && chance(0.25)) current = 2;
    }
    let stamp = addDays(invoiceDate, int(1, 2));
    if (current >= 0) {
      // Items still in the approval workflow were routed within the last few working days.
      const recent = addDays(today, -(int(0, 3) + current * 2));
      if (recent > stamp) stamp = recent;
    }
    const yesterday = workday(addDays(today, -1));
    const chain = roles.map((role, index) => {
      const approver = approverFor(role, cc);
      if (current === -1 || index < current) {
        const at = withTime(workday(stamp < today ? stamp : yesterday), int(8, 15), int(0, 59));
        stamp = addDays(stamp, int(1, 3));
        return { role, approver: approver.id, status: 'done', at: at.toISOString() };
      }
      const since = addDays(stamp, -1);
      return { role, approver: approver.id, status: index === current ? 'current' : 'waiting', since: index === current ? iso(workday(since < today ? since : today)) : null };
    });

    const lineCount = int(1, 3);
    const lines = [];
    let remaining = amount;
    for (let l = 0; l < lineCount; l++) {
      const desc = pick(category.lines).replace('{n}', String(int(2, 24))).replace('{fy1}', String(fiscalYear - 1));
      const lineAmount = l === lineCount - 1 ? money(remaining) : money(remaining * between(0.25, 0.6));
      remaining = money(remaining - lineAmount);
      const qty = desc.includes(' x ') || desc.includes('tonnes') ? int(4, 60) : 1;
      lines.push({ desc, qty, unit: money(lineAmount / qty), amount: lineAmount });
    }

    const hasPo = !['utilities', 'insurance'].includes(vendor.category);
    const invoice = {
      id: `AP-${String(fiscalYear).slice(2)}-${pad(apSequence += int(1, 6), 5)}`,
      vendorRef: `${pick(['INV', 'TI', 'BILL', 'SI'])}/${fiscalYear}/${pad(int(120, 9800), 4)}`,
      vendorId: vendor.id, entityId, ccId: cc.id, category: vendor.category,
      poNumber: hasPo ? `PO-${String(fiscalYear).slice(2)}-${pad(int(1200, 9800), 6)}` : null,
      grn: hasPo && chance(0.85) ? `GRN-${String(fiscalYear).slice(2)}-${pad(int(3000, 99999), 6)}` : null,
      invoiceDate: iso(invoiceDate), received: iso(workday(addDays(invoiceDate, int(0, 3)))), dueDate: iso(due), terms: vendor.terms,
      currency: vendor.currency, amount, fxRate: fx[vendor.currency], amountQar,
      status, match: hasPo ? weighted([['matched', 84], ['price', 8], ['qty', 8]]) : 'nopo',
      lines, chain, paidDate: null, paymentRun: null, holdReason: null
    };
    if (status === 'hold' || status === 'disputed') invoice.holdReason = pick(holdReasons);
    if (invoice.match === 'price' && status === 'hold') invoice.holdReason = holdReasons[0];
    if (status === 'paid') {
      const paid = workday(addDays(due < today ? due : today, -int(0, 5)));
      invoice.paidDate = iso(paid < invoiceDate ? invoiceDate : paid);
    }
    invoices.push(invoice);
  }
  invoices.sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1));

  let nextRun = new Date(today);
  while (nextRun.getDay() !== 3) nextRun = addDays(nextRun, 1);
  const runDates = [];
  for (let w = 9; w >= -1; w--) runDates.push(addDays(nextRun, -7 * w));
  const paymentRuns = runDates.map((date, index) => {
    const id = `PR-${fiscalYear}-${pad(32 + index, 2)}`;
    const status = index < runDates.length - 2 ? 'executed' : index === runDates.length - 2 ? 'awaiting' : 'draft';
    const windowStart = addDays(date, -7);
    const items = status === 'executed'
      ? invoices.filter((inv) => inv.status === 'paid' && new Date(inv.paidDate) > windowStart && new Date(inv.paidDate) <= date)
      : status === 'awaiting'
        ? invoices.filter((inv) => inv.status === 'scheduled' && new Date(inv.dueDate) <= addDays(date, 7))
        : invoices.filter((inv) => (inv.status === 'scheduled' && !inv.paymentRun) || (inv.status === 'approved' && new Date(inv.dueDate) <= addDays(date, 7))).slice(0, 24);
    items.forEach((inv) => { if (!inv.paymentRun) inv.paymentRun = id; });
    const amountQar = money(items.reduce((sum, inv) => sum + inv.amountQar, 0) || between(2.1e6, 7.8e6));
    const prepared = workday(addDays(date, -2));
    return {
      id, date: iso(date), status, payments: items.length || int(14, 41), amountQar,
      createdBy: people.ap.id, approvedBy: status === 'executed' ? people.treasury.id : null,
      createdAt: withTime(prepared < today ? prepared : workday(addDays(today, -1)), 14, int(5, 55)).toISOString(),
      channel: index % 3 === 0 ? 'SWIFT MT101' : 'Host-to-Host (ISO 20022 pain.001)',
      file: `PAIN001_ATH_${iso(date).replace(/-/g, '')}_${pad(index + 1, 3)}.xml`
    };
  });

  const customers = [
    ['Gulf Horizon Events W.L.L.', 'ATGH', 'Events & banqueting'],
    ['Al Bidda Travel & Tours W.L.L.', 'ATGH', 'Travel trade'],
    ['Skyline Corporate Travel W.L.L.', 'ATGH', 'Corporate accounts'],
    ['Silver Dune Hospitality Group', 'ATGH', 'Group bookings'],
    ['Arabian Peninsula Incentive Tours', 'ATGH', 'Travel trade'],
    ['Crestview Energy Services Qatar W.L.L.', 'ATRE', 'Commercial lease'],
    ['Corniche Retail Partners W.L.L.', 'ATRE', 'Retail lease'],
    ['Najma Healthcare Group W.L.L.', 'ATRE', 'Commercial lease'],
    ['Al Markhiya Education Services W.L.L.', 'ATRE', 'Commercial lease'],
    ['Pearl Gate Consulting LLC', 'ATRE', 'Office lease'],
    ['Harbour Line Shipping W.L.L.', 'ATLG', 'Contract logistics'],
    ['Al Shamal Building Materials W.L.L.', 'ATLG', 'Warehousing'],
    ['Al Wajbah International School', 'ATFM', 'FM contract'],
    ['Doha Riverside Mall Management W.L.L.', 'ATFM', 'FM contract'],
    ['Bayview Hotel Apartments W.L.L.', 'ATFM', 'FM contract'],
    ['Al Dafna Business Centre W.L.L.', 'ATFM', 'FM contract'],
    ['Najd Home Appliances W.L.L.', 'ATTR', 'Wholesale'],
    ['Saffron Interiors Trading W.L.L.', 'ATTR', 'Wholesale'],
    ['Gulf Coast Hypermarkets W.L.L.', 'ATTR', 'Key account'],
    ['Atlas Engineering Contracting W.L.L.', 'ATTR', 'Project supply'],
    ['Al Gharrafa Residential Compound Owners Association', 'ATFM', 'FM contract'],
    ['Lusail Marina Yacht Club W.L.L.', 'ATGH', 'Events & banqueting']
  ].map(([name, entity, segment], index) => ({ id: `C-${2001 + index}`, name, entity, segment, limit: Math.round(logUniform(0.5e6, 12e6) / 50000) * 50000, terms: pick([30, 30, 45, 60]) }));

  const arReferences = {
    ATGH: ['Banquet - corporate gala dinner', 'Room block - incentive group', 'Conference package - 3 days', 'Corporate rate agreement - monthly billing'],
    ATRE: ['Rent - quarterly in advance', 'Service charges - quarter', 'Fit-out contribution recharge', 'Car park allocation - annual'],
    ATLG: ['Warehousing - pallet storage', 'Distribution services - monthly', 'Cold-chain storage - monthly'],
    ATFM: ['Integrated FM services - monthly', 'Reactive maintenance - call-outs', 'Cleaning services - monthly'],
    ATTR: ['Supply of home appliances', 'Supply of lighting fixtures', 'Supply of steel reinforcement']
  };
  const receivables = [];
  let arSequence = 640;
  for (let i = 0; i < 156; i++) {
    const customer = pick(customers);
    const issue = workday(addDays(today, -int(2, 170)));
    const due = addDays(issue, customer.terms);
    const amount = money(Math.round(logUniform(18000, customer.entity === 'ATRE' ? 2400000 : 1200000) / 10) * 10);
    const pastDue = dayDiff(due, today);
    let status = 'open';
    let paid = 0;
    if (pastDue > 60) {
      if (chance(0.86)) { status = 'paid'; paid = amount; }
      else if (chance(0.4)) status = 'dispute';
    } else if (pastDue > 15 && chance(0.62)) { status = 'paid'; paid = amount; }
    else if (pastDue > -10 && chance(0.22)) { status = 'partial'; paid = money(amount * between(0.2, 0.7)); }
    receivables.push({ id: `AR-${String(fiscalYear).slice(2)}-${pad(arSequence += int(1, 5), 5)}`, customerId: customer.id, entityId: customer.entity, issueDate: iso(issue), dueDate: iso(due), amount, paid, status, reference: pick(arReferences[customer.entity]) });
  }
  receivables.sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));

  const openingCash = accounts.reduce((sum, a) => sum + a.balanceQar, 0);
  let nextSunday = addDays(today, 1);
  while (nextSunday.getDay() !== 0) nextSunday = addDays(nextSunday, 1);
  let balance = openingCash;
  const forecast = Array.from({ length: 13 }, (_, w) => {
    const weekStart = addDays(nextSunday, 7 * w);
    const payrollWeek = addDays(weekStart, 7).getMonth() !== weekStart.getMonth();
    const inflow = money(between(64e6, 112e6));
    const outflow = money(between(58e6, 101e6) + (payrollWeek ? 48.6e6 : 0));
    balance = money(balance + inflow - outflow);
    return { week: w + 1, start: iso(weekStart), inflow, outflow, closing: balance, payroll: payrollWeek };
  });

  const centre = (id) => costCentres.find((c) => c.id === id);
  const approvals = invoices
    .filter((inv) => inv.status === 'pending' && inv.chain.some((step) => step.status === 'current' && step.role === 'fc'))
    .slice(0, 14)
    .map((inv) => ({ id: `APR-${inv.id}`, type: 'invoice', ref: inv.id, amountQar: inv.amountQar, requestedBy: centre(inv.ccId).manager.id, since: inv.chain.find((s) => s.status === 'current').since }));
  const runAwaiting = paymentRuns.find((run) => run.status === 'awaiting');
  approvals.unshift({ id: 'APR-RUN', type: 'run', ref: runAwaiting.id, amountQar: runAwaiting.amountQar, requestedBy: people.ap.id, since: iso(workday(addDays(today, -1))) });
  approvals.push(
    { id: 'APR-BT', type: 'budget', ref: `BT-${fiscalYear}-031`, amountQar: 750000, requestedBy: people.budget.id, since: iso(workday(addDays(today, -3))), from: 'CC-3200', to: 'CC-3100' },
    { id: 'APR-VCR', type: 'vendor', ref: `VCR-${fiscalYear}-118`, amountQar: null, requestedBy: people.procurement.id, since: iso(workday(addDays(today, -2))), vendorId: vendors.find((v) => v.name.startsWith('Fuwairit')).id },
    { id: 'APR-JE', type: 'journal', ref: `JE-${fiscalYear}-${pad(Math.max(currentPeriod, 1), 2)}-0042`, amountQar: 1286400, requestedBy: people.ap.id, since: iso(workday(today)) }
  );

  const auditTemplates = [
    ['persona', 'approve', 'invoice'], ['persona', 'view', 'report'], ['ap', 'create', 'run'], ['treasury', 'release', 'run'],
    ['accountant', 'post', 'invoice'], ['procurement', 'change', 'vendor'], ['audit', 'export', 'report'], ['credit', 'update', 'receivable'],
    ['budget', 'transfer', 'budget'], ['cfo', 'approve', 'invoice'], ['accountant', 'signin', 'session'], ['ap', 'export-denied', 'vendor']
  ];
  const workstation = {};
  Object.keys(people).forEach((key, index) => { workstation[key] = `10.40.${12 + (index % 4)}.${31 + index * 7}`; });
  const audit = Array.from({ length: 84 }, () => {
    const [who, action, object] = pick(auditTemplates);
    let at = withTime(addDays(today, -int(0, 11)), int(7, 16), int(0, 59));
    while (isWeekend(at)) at = addDays(at, -1);
    const inv = pick(invoices);
    const refs = { invoice: inv.id, report: pick(['AP aging', 'Treasury position', 'Budget variance', 'Management pack']), run: pick(paymentRuns).id, vendor: pick(vendors).id, receivable: pick(receivables).id, budget: `BT-${fiscalYear}-0${int(18, 30)}`, session: 'SSO · Kerberos' };
    return { at: at.toISOString(), user: people[who].id, action, object, ref: refs[object], ip: workstation[who], outcome: action === 'export-denied' ? 'denied' : 'success' };
  }).sort((a, b) => (a.at < b.at ? 1 : -1));

  const notifications = [
    { kind: 'run', ref: paymentRuns[paymentRuns.length - 3].id, amountQar: paymentRuns[paymentRuns.length - 3].amountQar, at: withTime(workday(addDays(today, -1)), 15, 42).toISOString() },
    { kind: 'sla', count: 3, at: withTime(workday(today), 8, 5).toISOString() },
    { kind: 'vendor', vendorId: vendors.find((v) => v.name.startsWith('Fuwairit')).id, at: withTime(workday(addDays(today, -2)), 11, 18).toISOString() },
    { kind: 'budget', ccId: 'CC-2200', pct: 96, at: withTime(workday(addDays(today, -3)), 9, 30).toISOString() },
    { kind: 'close', period: Math.max(currentPeriod - 1, 0), at: withTime(workday(addDays(today, -today.getDate() + 1)), 17, 10).toISOString() }
  ];

  ns.data = {
    today: iso(today), fiscalYear, currentPeriod, elapsedPeriods, fx,
    people, managers, entities, costCentres, categories, vendors, banks, accounts,
    monthly, budgetPlan, invoices, paymentRuns, customers, receivables, forecast, openingCash, policyMinimum: 400e6,
    approvals, audit, notifications,
    syncedAt: withTime(today, 8, 55).toISOString()
  };
})(window.ATH = window.ATH || {});
