export const getDruidTree = (dateString) => {
    if (!dateString) return { name: "Неизвестное дерево", image: null, description: "Укажите дату рождения в профиле" };

    let date;
    // Handle DD.MM.YYYY format manually
    if (typeof dateString === 'string' && dateString.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
        const [d, m, y] = dateString.split('.').map(Number);
        date = new Date(y, m - 1, d);
    } else {
        date = new Date(dateString);
    }

    if (isNaN(date.getTime())) return { name: "Неизвестное дерево", image: null, description: "Проверьте формат даты" };

    const day = date.getDate();
    const month = date.getMonth() + 1; // 1-12

    let tree = { name: "Неизвестно", image: null, description: "" };

    // Logic for Druid Horoscope ranges
    if ((month === 12 && day >= 23) || (month === 1 && day <= 1)) tree = { name: "Яблоня", image: "yablonya.webp", description: "Сердечность, вдумчивость и интеллектуальность" };
    else if (month === 1 && day >= 2 && day <= 11) tree = { name: "Ель", image: "pihta.webp", description: "Благородство, эстетика и изысканность" };
    else if (month === 1 && day >= 12 && day <= 24) tree = { name: "Вяз", image: "vyaz.webp", description: "Надежность, открытость и здравый смысл" };
    else if ((month === 1 && day >= 25) || (month === 2 && day <= 3)) tree = { name: "Кипарис", image: "kiparis.webp", description: "Сила характера, самостоятельность и оптимизм" };
    else if (month === 2 && day >= 4 && day <= 8) tree = { name: "Тополь", image: "topol.webp", description: "Чувствительность, независимость и художественный вкус" };
    else if (month === 2 && day >= 9 && day <= 18) tree = { name: "Кедр", image: "kedr.webp", description: "Уверенность, решительность и общительность" };
    else if (month === 2 && day >= 19 && day <= 28) tree = { name: "Сосна", image: "sosna.webp", description: "Смелость, упорство и организаторские способности" };
    else if (month === 3 && day >= 1 && day <= 10) tree = { name: "Ива", image: "iva.webp", description: "Интуиция, богатство воображения и артистичность" };
    else if (month === 3 && day >= 11 && day <= 20) tree = { name: "Липа", image: "lipa.webp", description: "Обаяние, уступчивость и спокойствие" };
    else if (month === 3 && day === 21) tree = { name: "Дуб", image: "dub.webp", description: "Отвага, выдержка и сила воли" };
    else if (month === 3 && day >= 22 && day <= 31) tree = { name: "Орешник", image: "oreshnik.webp", description: "Оригинальность, интуиция и нестандартный ум" };
    else if (month === 4 && day >= 1 && day <= 10) tree = { name: "Рябина", image: "ryabina.webp", description: "Чуткость, дипломатичность и хороший вкус" };
    else if (month === 4 && day >= 11 && day <= 20) tree = { name: "Клен", image: "klen.webp", description: "Энергия, бодрость, неутомимость и умение генерировать идеи" };
    else if (month === 4 && day >= 21 && day <= 30) tree = { name: "Грецкий орех", image: "oreh.webp", description: "Стратегия, лидерство и сильный характер" };
    else if (month === 5 && day >= 1 && day <= 14) tree = { name: "Жасмин", image: "jasmin.webp", description: "Критический ум, интеллигентность и фантазия" };
    else if (month === 5 && day >= 15 && day <= 24) tree = { name: "Каштан", image: "kashtan.webp", description: "Справедливость, дипломатия и дальновидность" };
    else if ((month === 5 && day >= 25) || (month === 6 && day <= 3)) tree = { name: "Ясень", image: "yasen.webp", description: "Интуиция, проницательность и смелость" };
    else if (month === 6 && day >= 4 && day <= 13) tree = { name: "Граб", image: "grab.webp", description: "Эстетика, дисциплина и ответственность" };
    else if (month === 6 && day >= 14 && day <= 23) tree = { name: "Инжир", image: "injir.webp", description: "Практичный ум, наблюдательность и реализм" };
    else if (month === 6 && day === 24) tree = { name: "Береза", image: "bereza.webp", description: "Интеллигентность, воображение и изобретательность" };
    else if ((month === 6 && day >= 25) || (month === 7 && day <= 4)) tree = { name: "Яблоня", image: "yablonya.webp", description: "Сердечность, вдумчивость и интеллектуальность" };
    else if (month === 7 && day >= 5 && day <= 14) tree = { name: "Ель", image: "pihta.webp", description: "Благородство, эстетика и изысканность" };
    else if (month === 7 && day >= 15 && day <= 25) tree = { name: "Вяз", image: "vyaz.webp", description: "Надежность, открытость и здравый смысл" };
    else if ((month === 7 && day >= 26) || (month === 8 && day <= 4)) tree = { name: "Кипарис", image: "kiparis.webp", description: "Сила характера, самостоятельность и оптимизм" };
    else if (month === 8 && day >= 5 && day <= 13) tree = { name: "Тополь", image: "topol.webp", description: "Чувствительность, независимость и художественный вкус" };
    else if (month === 8 && day >= 14 && day <= 23) tree = { name: "Кедр", image: "kedr.webp", description: "Уверенность, решительность и общительность" };
    else if ((month === 8 && day >= 24) || (month === 9 && day <= 2)) tree = { name: "Сосна", image: "sosna.webp", description: "Смелость, упорство и организаторские способности" };
    else if (month === 9 && day >= 3 && day <= 12) tree = { name: "Ива", image: "iva.webp", description: "Интуиция, богатство воображения и артистичность" };
    else if (month === 9 && day >= 13 && day <= 22) tree = { name: "Липа", image: "lipa.webp", description: "Обаяние, уступчивость и спокойствие" };
    else if (month === 9 && day === 23) tree = { name: "Олива", image: "oliva.webp", description: "Мудрость, уравновешенность и теплота" };
    else if ((month === 9 && day >= 24) || (month === 10 && day <= 3)) tree = { name: "Орешник", image: "oreshnik.webp", description: "Оригинальность, интуиция и нестандартный ум" };
    else if (month === 10 && day >= 4 && day <= 13) tree = { name: "Рябина", image: "ryabina.webp", description: "Чуткость, дипломатичность и хороший вкус" };
    else if (month === 10 && day >= 14 && day <= 23) tree = { name: "Клен", image: "klen.webp", description: "Энергия, бодрость, неутомимость и умение генерировать идеи" };
    else if ((month === 10 && day >= 24) || (month === 11 && day <= 2)) tree = { name: "Грецкий орех", image: "oreh.webp", description: "Стратегия, лидерство и сильный характер" };
    else if (month === 11 && day >= 3 && day <= 11) tree = { name: "Жасмин", image: "jasmin.webp", description: "Критический ум, интеллигентность и фантазия" };
    else if (month === 11 && day >= 12 && day <= 21) tree = { name: "Каштан", image: "kashtan.webp", description: "Справедливость, дипломатия и дальновидность" };
    else if ((month === 11 && day >= 22) || (month === 12 && day <= 1)) tree = { name: "Ясень", image: "yasen.webp", description: "Интуиция, проницательность и смелость" };
    else if (month === 12 && day >= 2 && day <= 11) tree = { name: "Граб", image: "grab.webp", description: "Эстетика, дисциплина и ответственность" };
    else if (month === 12 && day >= 12 && day <= 21) tree = { name: "Инжир", image: "injir.webp", description: "Практичный ум, наблюдательность и реализм" };
    else if (month === 12 && day === 22) tree = { name: "Бук", image: "buk.webp", description: "Находчивость, точность и организаторские таланты" };

    if (!tree.name) tree = { name: "Дерево Жизни", image: null, description: "Символ роста и силы" };

    return {
        ...tree,
        image: tree.image ? `/goroscop/${tree.image}` : null
    };
};
