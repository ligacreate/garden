export const COLORS = {
    bg: "bg-slate-50",
    glass: "bg-white/90 backdrop-blur-xl border border-white/20 shadow-sm",
    primary: "text-slate-900",
    secondary: "text-slate-500",
    accent: "bg-blue-600",
    accentText: "text-blue-700",
};

export const SEASONS = {
    WINTER: 'winter',
    SPRING: 'spring',
    SUMMER: 'summer',
    AUTUMN: 'autumn'
};

export const getSeason = () => {
    const month = new Date().getMonth();
    if (month === 11 || month === 0 || month === 1) return SEASONS.WINTER;
    if (month >= 2 && month <= 4) return SEASONS.SPRING;
    if (month >= 5 && month <= 7) return SEASONS.SUMMER;
    return SEASONS.AUTUMN;
};

// Расширенный гороскоп друидов (Точки убраны из описаний, чтобы ставить их после кавычек)
export const DRUID_TREES = [
    { name: "Яблоня", archetype: "fruit", dates: [[12, 23, 12, 31], [1, 1, 1, 1], [6, 25, 7, 4]], desc: "Сердечность, сентиментальность, острый ум и умение радоваться мелочам" },
    { name: "Пихта", archetype: "coniferous", dates: [[1, 2, 1, 11], [7, 5, 7, 14]], desc: "Холодная красота, гордость, требовательность к себе и умение создавать структуру" },
    { name: "Вяз", archetype: "mighty", dates: [[1, 12, 1, 24], [7, 15, 7, 25]], desc: "Статность, открытость, умение руководить и вдохновлять людей своим спокойствием" },
    { name: "Кипарис", archetype: "slender", dates: [[1, 25, 2, 3], [7, 26, 8, 4]], desc: "Внутренняя сила, стройность мыслей, умение адаптироваться к любым условиям" },
    { name: "Тополь", archetype: "slender", dates: [[2, 4, 2, 8], [8, 5, 8, 13]], desc: "Декоративность, тонкая чувствительность, эмпатия и умение чувствовать красоту" },
    { name: "Кедр", archetype: "coniferous", dates: [[2, 9, 2, 18], [8, 14, 8, 23]], desc: "Солидность, уверенность, решительность и способность вести за собой большие группы" },
    { name: "Сосна", archetype: "coniferous", dates: [[2, 19, 2, 28], [8, 24, 9, 2]], desc: "Изысканность, умение подчеркнуть достоинства и организаторский талант" },
    { name: "Ива", archetype: "weeping", dates: [[3, 1, 3, 10], [9, 3, 9, 12]], desc: "Меланхоличность, загадочность, невероятная интуиция и чувственность" },
    { name: "Липа", archetype: "mighty", dates: [[3, 11, 3, 20], [9, 13, 9, 22]], desc: "Обаяние, дипломатичность, умение создавать комфорт и принимать людей такими, какие они есть" },
    { name: "Орешник", archetype: "mighty", dates: [[3, 22, 3, 31], [9, 24, 10, 3]], desc: "Скрытая магическая сила, очарование, умение слушать и понимать без слов" },
    { name: "Рябина", archetype: "fruit", dates: [[4, 1, 4, 10], [10, 4, 10, 13]], desc: "Чувствительность, стойкость перед невзгодами и умение дарить тепло другим" },
    { name: "Клен", archetype: "mighty", dates: [[4, 11, 4, 20], [10, 14, 10, 23]], desc: "Энергия, бодрость, неутомимость и умение генерировать идеи" },
    { name: "Орех", archetype: "mighty", dates: [[4, 21, 4, 30], [10, 24, 11, 2]], desc: "Страсть, противоречивость, гостеприимство" },
    { name: "Жасмин", archetype: "slender", dates: [[5, 1, 5, 14], [11, 3, 11, 11]], desc: "Подвижность, живость, общительность" },
    { name: "Каштан", archetype: "mighty", dates: [[5, 15, 5, 24], [11, 12, 11, 21]], desc: "Прямота, справедливость, отвага" },
    { name: "Ясень", archetype: "mighty", dates: [[5, 25, 6, 3], [11, 22, 12, 1]], desc: "Импульсивность, требовательность, интуиция" },
    { name: "Граб", archetype: "mighty", dates: [[6, 4, 6, 13], [12, 2, 12, 11]], desc: "Эстетика, дисциплина, ответственность" },
    { name: "Инжир", archetype: "mighty", dates: [[6, 14, 6, 23], [12, 12, 12, 20]], desc: "Впечатлительность, семейственность, практичность" },
    { name: "Дуб", archetype: "mighty", dates: [[3, 21, 3, 21]], desc: "Невероятная сила, отвага, независимость и стальной стержень" },
    { name: "Береза", archetype: "weeping", dates: [[6, 24, 6, 24]], desc: "Аристократизм, сдержанность, деликатность и творческая натура" },
    { name: "Маслина", archetype: "slender", dates: [[9, 23, 9, 23]], desc: "Спокойствие, уравновешенность, солнце" },
    { name: "Бук", archetype: "mighty", dates: [[12, 21, 12, 22]], desc: "Находчивость, точность, организаторские способности" },
];

export const getTreeByDate = (dateString) => {
    if (!dateString) return DRUID_TREES[0];
    const date = new Date(dateString);
    const m = date.getMonth() + 1;
    const d = date.getDate();

    for (let tree of DRUID_TREES) {
        for (let range of tree.dates) {
            // Format: [StartMonth, StartDay, EndMonth, EndDay]
            const startM = range[0];
            const startD = range[1];
            const endM = range[2] || startM; // If missing, same month
            const endD = range[3] || startD; // If missing, single day

            if (m === startM && m === endM) {
                if (d >= startD && d <= endD) return tree;
            } else if (m === startM) {
                if (d >= startD) return tree;
            } else if (m === endM) {
                if (d <= endD) return tree;
            }
        }
    }
    // Fallback
    return DRUID_TREES[0];
};

export const getTreeByName = (name) => {
    return DRUID_TREES.find(t => t.name === name) || DRUID_TREES[0];
};

export const INITIAL_KNOWLEDGE = [
    { id: 1, title: "Как собрать первую встречу", role: "all", type: "Видео" },
    { id: 2, title: "Чек-лист подготовки", role: "all", type: "PDF" },
];

export const INITIAL_USERS = [
    { id: 100, email: "olga@skrebeyko.com", password: "12345", name: "Ольга Скребейко", city: "Сад", role: "admin", tree: "Дуб", seeds: 9999, avatar: null, emoji: "👩🏼‍🌾", x: 50, y: 50, skills: ["Фасилитация", "Психология"] },
];

export const INITIAL_PRACTICES = [
    { id: 1, title: "Письмо обиды", time: "15 мин", type: "Травма", description: "Глубокая практика...", icon: "📝", status: "approved" },
    { id: 2, title: "Медитация света", time: "10 мин", type: "Ресурс", description: "Наполнение энергией...", icon: "✨", status: "approved" },
];

export const INITIAL_CLIENTS = [
    { id: 1, name: "Анна Смирнова", contact: "@smirnova_anya", lastVisit: "2024-11-28", lastContact: "2024-12-01", visits: 3, notes: "Любит ресурсные практики, боится проявляться в голосе", status: "active" },
];

export const getRoleLabel = (r) => {
    if (!r) return 'Абитуриент';
    const role = r.toLowerCase();
    if (role === 'leader') return 'Ведущая';
    if (role === 'intern') return 'Стажер';
    if (role === 'mentor') return 'Ментор';
    if (role === 'curator') return 'Куратор';
    if (role === 'admin') return 'Администратор';
    if (role === 'applicant') return 'Абитуриент';
    return r; // Fallback
};
