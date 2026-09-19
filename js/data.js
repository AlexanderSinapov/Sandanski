// All places use real coordinates.
// `name` = Bulgarian name (big 3D title), `bg` = Latin name (huge outline text behind it).
//
// Street View cards: give a card `lat`/`lng` of the landmark it describes and it will float in that
// exact compass direction, showing distance + direction (e.g. "350 м · СИ"). The direction and distance
// are recomputed if you walk around in Street View. Landmark coordinates come from Wikipedia unless noted.
// A card without coordinates is a "you are here" card; it sits 45° right of the main view direction (or `dh` degrees).
// `wiki` = English Wikipedia article used to fetch a photo (free, no key). Or use img: "assets/photos/x.jpg".

export const POIS = [
  {
    id: "sofia", name: "София", bg: "SOFIA", tag: "Начало · столицата",
    lat: 42.6958, lng: 23.3328,
    cards: [
      { title: "Храм-паметник „Св. Александър Невски“", wiki: "Alexander_Nevsky_Cathedral,_Sofia", lat: 42.69583, lng: 23.33296,
        text: "Построен между 1882 и 1912 г. в памет на загиналите в Руско-турската освободителна война. Златните му куполи са символ на града." },
      { title: "Църквата „Св. София“", wiki: "Saint_Sophia_Church,_Sofia", lat: 42.69651, lng: 23.33142,
        text: "Базилика от VI век, една от най-старите църкви в града. На нея е кръстена и самата София." },
      { title: "Амфитеатърът на Сердика", wiki: "Amphitheatre_of_Serdica", lat: 42.69722, lng: 23.32833,
        text: "Руини на римски амфитеатър от III–IV век, открити случайно през 2004 г. при строежа на хотел." },
      { title: "Черни връх", wiki: "Cherni_Vrah", lat: 42.56361, lng: 23.27833,
        text: "Най-високият връх на Витоша, 2290 м. Оттук започва пътят ни на юг." },
    ],
  },
  {
    id: "blagoevgrad", name: "Благоевград", bg: "BLAGOEVGRAD", tag: "Спирка 2 · студентският град",
    lat: 42.0137, lng: 23.0945,
    cards: [
      { title: "Благоевград", wiki: "Blagoevgrad",
        text: "Център на Пиринския край, на река Благоевградска Бистрица, която се влива в Струма." },
      { title: "Американски университет", wiki: "American_University_in_Bulgaria", lat: 42.02139, lng: 23.09500,
        text: "Американският университет в България е открит през 1991 г. Заедно с Югозападния университет прави града студентски." },
    ],
  },
  {
    id: "kresna", name: "Кресненско дефиле", bg: "KRESNA", tag: "По пътя · проломът на Струма",
    lat: 41.7960, lng: 23.1560, heading: 180,
    cards: [
      { title: "Кресненско дефиле", wiki: "Kresna_Gorge", lat: 41.76861, lng: 23.15500,
        text: "Река Струма е издълбала тесен пролом между Пирин и Малешевска планина. Пътят продължава по него на юг." },
      { title: "Битката при Кресна", wiki: "Battle_of_Kresna_Gorge", lat: 41.80089, lng: 23.15970,
        text: "През 1913 г., във Втората балканска война, българската армия спира тук настъплението на гръцката армия." },
      { title: "Бяло море", wiki: "Thermaic_Gulf", lat: 40.55, lng: 22.90, // Thermaic Gulf, approximate centre
        text: "Оттук на юг долината се отваря към Егейско море. Топлият му въздух прави климата средиземноморски." },
    ],
  },
  {
    id: "melnik", name: "Мелник", bg: "MELNIK", tag: "Спирка 3 · най-малкият град",
    lat: 41.5229, lng: 23.3930,
    cards: [
      { title: "Мелник", wiki: "Melnik,_Bulgaria",
        text: "Най-малкият град в България, прочут с виното си и с възрожденските си къщи." },
      { title: "Кордопуловата къща", wiki: "Kordopulov_House", lat: 41.52306, lng: 23.39833,
        text: "Построена през 1754 г., тя е най-голямата възрожденска къща в България, с винени изби, издълбани в скалата." },
      { title: "Мелнишките пирамиди", wiki: "Melnik_Earth_Pyramids", lat: 41.52556, lng: 23.39472,
        text: "Вятърът и дъждът са превърнали пясъчниковите хълмове около града в гигантски пирамиди и кули." },
      { title: "Роженски манастир", wiki: "Rozhen_Monastery", lat: 41.53049, lng: 23.42646,
        text: "Най-големият манастир в Пирин, на няколко километра от Мелник, със средновековна история." },
    ],
  },
  {
    id: "sandanski", name: "Сандански", bg: "SANDANSKI", tag: "Крайна цел",
    lat: 41.5667, lng: 23.2797,
    cards: [
      { title: "Партикополис", wiki: "Parthicopolis", lat: 41.56513, lng: 23.27973,
        text: "Под центъра на Сандански е античният град Партикополис, с руини на раннохристиянска базилика." },
      { title: "Паметникът на Спартак", wiki: "Spartacus", lat: 41.55167, lng: 23.26917, // tourism.government.bg
        text: "Според местното предание Спартак е роден тук. 7-метровата му статуя посреща пътниците на входа на града." },
      { title: "Сандански", wiki: "Sandanski",
        text: "Един от най-слънчевите и най-топлите градове в България, курорт с над 80 минерални извора." },
    ],
  },
  {
    id: "rupite", name: "Рупите", bg: "RUPITE", tag: "Отбивка · вулканът",
    lat: 41.44167, lng: 23.24111,
    cards: [
      { title: "Рупите", wiki: "Rupite",
        text: "Горещи минерални извори, около 75 °C, в подножието на угасналия вулкан Кожух." },
      { title: "Ванга", wiki: "Baba_Vanga", dh: -45,
        text: "Тук е живяла пророчицата Ванга. По нейна инициатива е построена църквата „Св. Петка“, осветена през 1994 г." },
    ],
  },
];

// Approximate road route: Sofia → Blagoevgrad (A3 Struma) → Kresna Gorge → past Sandanski → Melnik → back to Sandanski.
export const ROUTE = [
  [42.6977, 23.3219], [42.6700, 23.2900], [42.6400, 23.2000], [42.6000, 23.1000],
  [42.5500, 23.0800], [42.4500, 23.0900], [42.3500, 23.1000], [42.2656, 23.1181],
  [42.1500, 23.1000], [42.0600, 23.0850], [42.0137, 23.0945],                     // Blagoevgrad
  [41.9500, 23.1000], [41.8900, 23.1100], [41.8300, 23.1450], [41.7700, 23.1550], // Kresna Gorge
  [41.7234, 23.1564], [41.6600, 23.1900], [41.6100, 23.2300], [41.5750, 23.2550],
  [41.5517, 23.2692], [41.5300, 23.2850], [41.5150, 23.3050], [41.5100, 23.3400],
  [41.5180, 23.3750], [41.5229, 23.3930],                                         // Melnik
  [41.5300, 23.3600], [41.5450, 23.3200], [41.5600, 23.2950], [41.5667, 23.2797], // Sandanski
];

// Struma river (approximate), for decoration.
export const RIVER = [
  [42.5600, 23.2300], [42.6000, 23.0600], [42.5400, 22.9600], [42.4700, 22.7700],
  [42.3600, 22.8200], [42.2500, 22.8600], [42.1500, 22.9900], [42.0300, 23.0500],
  [41.9000, 23.1050], [41.7700, 23.1500], [41.6600, 23.1850], [41.5800, 23.2350],
  [41.5000, 23.2900], [41.4000, 23.3500],
];

// Scroll chapters: where the camera looks, how far away, how high, and from which angle (radians).
// Must match the <section data-chapter> blocks in index.html.
export const CHAPTERS = [
  { overview: true },
  { lat: 42.6958, lng: 23.3328, dist: 1.6, height: 1.3, angle: 0.5 },   // 1 Sofia
  { lat: 42.0137, lng: 23.0945, dist: 1.8, height: 1.2, angle: 0.9 },   // 2 Blagoevgrad
  { lat: 41.7800, lng: 23.1550, dist: 1.3, height: 0.6, angle: 3.0 },   // 3 Kresna Gorge
  { lat: 41.5229, lng: 23.3930, dist: 1.5, height: 1.1, angle: 2.2 },   // 4 Melnik
  { lat: 41.5667, lng: 23.2797, dist: 1.7, height: 1.2, angle: 2.6 },   // 5 Sandanski
  { top: true },
];
