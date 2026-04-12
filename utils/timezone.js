const CITY_TIMEZONES = {
  // UTC+2 (MSK-1)
  'калининград': 'Europe/Kaliningrad',

  // UTC+3 (MSK)
  'москва': 'Europe/Moscow',
  'мск': 'Europe/Moscow',
  'санкт-петербург': 'Europe/Moscow',
  'санкт петербург': 'Europe/Moscow',
  'спб': 'Europe/Moscow',
  'казань': 'Europe/Moscow',
  'сочи': 'Europe/Moscow',
  'краснодар': 'Europe/Moscow',
  'крым': 'Europe/Moscow',
  'симферополь': 'Europe/Moscow',
  'нижний новгород': 'Europe/Moscow',
  'нижний': 'Europe/Moscow',
  'вологда': 'Europe/Moscow',
  'воронеж': 'Europe/Moscow',
  'тверь': 'Europe/Moscow',
  'тула': 'Europe/Moscow',
  'рязань': 'Europe/Moscow',
  'иваново': 'Europe/Moscow',
  'ярославль': 'Europe/Moscow',
  'кострома': 'Europe/Moscow',
  'смоленск': 'Europe/Moscow',
  'брянск': 'Europe/Moscow',
  'калуга': 'Europe/Moscow',
  'орел': 'Europe/Moscow',
  'липецк': 'Europe/Moscow',
  'тамбов': 'Europe/Moscow',
  'псков': 'Europe/Moscow',
  'великий новгород': 'Europe/Moscow',
  'мурманск': 'Europe/Moscow',
  'архангельск': 'Europe/Moscow',
  'петрозаводск': 'Europe/Moscow',
  'белгород': 'Europe/Moscow',
  'курск': 'Europe/Moscow',
  'ростов-на-дону': 'Europe/Moscow',
  'ростов на дону': 'Europe/Moscow',
  'волгоград': 'Europe/Moscow',
  'астрахань': 'Europe/Astrakhan',
  'ульяновск': 'Europe/Ulyanovsk',

  // UTC+4
  'самара': 'Europe/Samara',
  'саратов': 'Europe/Saratov',
  'ижевск': 'Europe/Samara',
  'тольятти': 'Europe/Samara',

  // UTC+5
  'екатеринбург': 'Asia/Yekaterinburg',
  'екб': 'Asia/Yekaterinburg',
  'челябинск': 'Asia/Yekaterinburg',
  'пермь': 'Asia/Yekaterinburg',
  'тюмень': 'Asia/Yekaterinburg',
  'уфа': 'Asia/Yekaterinburg',
  'оренбург': 'Asia/Yekaterinburg',
  'курган': 'Asia/Yekaterinburg',

  // UTC+6
  'омск': 'Asia/Omsk',

  // UTC+7
  'новосибирск': 'Asia/Novosibirsk',
  'нск': 'Asia/Novosibirsk',
  'томск': 'Asia/Tomsk',
  'кемерово': 'Asia/Novosibirsk',
  'новокузнецк': 'Asia/Novosibirsk',
  'барнаул': 'Asia/Barnaul',
  'белокуриха': 'Asia/Barnaul',
  'горно-алтайск': 'Asia/Barnaul',
  'горно алтайск': 'Asia/Barnaul',

  // UTC+8
  'красноярск': 'Asia/Krasnoyarsk',
  'абакан': 'Asia/Krasnoyarsk',
  'норильск': 'Asia/Krasnoyarsk',
  'нерюнгри': 'Asia/Yakutsk',

  // UTC+9
  'иркутск': 'Asia/Irkutsk',
  'улан-удэ': 'Asia/Irkutsk',
  'улан удэ': 'Asia/Irkutsk',
  'чита': 'Asia/Chita',

  // UTC+10
  'якутск': 'Asia/Yakutsk',
  'благовещенск': 'Asia/Yakutsk',
  'хабаровск': 'Asia/Khabarovsk',
  'биробиджан': 'Asia/Khabarovsk',

  // UTC+11
  'владивосток': 'Asia/Vladivostok',
  'уссурийск': 'Asia/Vladivostok',
  'находка': 'Asia/Vladivostok',
  'южно-сахалинск': 'Asia/Sakhalin',
  'южно сахалинск': 'Asia/Sakhalin',
  'сахалин': 'Asia/Sakhalin',

  // UTC+12
  'магадан': 'Asia/Magadan',
  'петропавловск-камчатский': 'Asia/Kamchatka',
  'петропавловск камчатский': 'Asia/Kamchatka',

  // СНГ / другие
  'минск': 'Europe/Minsk',
  'киев': 'Europe/Kyiv',
  'алматы': 'Asia/Almaty',
  'дубай': 'Asia/Dubai',

  // Special
  'онлайн': null
};

export const DEFAULT_TIMEZONE = 'Europe/Moscow';

export const resolveCityTimezone = (city, fallback = null) => {
  if (!city || typeof city !== 'string') return fallback;

  const normalized = city.trim().toLowerCase();
  if (CITY_TIMEZONES[normalized]) return CITY_TIMEZONES[normalized];

  return fallback;
};
