import React from 'react';

const TREE_IMAGES = {
    "Яблоня": "yablonya.webp",
    "Пихта": "pihta.webp",
    "Вяз": "vyaz.webp",
    "Кипарис": "kiparis.webp",
    "Тополь": "topol.webp",
    "Кедр": "kedr.webp",
    "Сосна": "sosna.webp",
    "Ива": "iva.webp",
    "Липа": "lipa.webp",
    "Орешник": "oreshnik.webp",
    "Рябина": "ryabina.webp",
    "Клен": "klen.webp",
    "Орех": "oreh.webp",
    "Жасмин": "jasmin.webp",
    "Каштан": "kashtan.webp",
    "Ясень": "yasen.webp",
    "Граб": "grab.webp",
    "Инжир": "injir.webp",
    "Дуб": "dub.webp",
    "Береза": "bereza.webp",
    "Маслина": "oliva.webp",
    "Бук": "buk.webp"
};

const LivingTree = ({ level, treeName }) => {
    // Get image filename or default to Oak (Дуб)
    const filename = TREE_IMAGES[treeName] || "dub.webp";
    const imagePath = `/goroscop/${filename}`;

    // Size logic based on level
    // Level 1 (New): Small
    // Level 3 (Adult): Full size
    const isSmall = level < 2;

    return (
        <div className={`relative flex items-end justify-center transition-all duration-700 ${isSmall ? 'w-full h-full scale-75 opacity-90' : 'w-full h-full'}`}>
            <img
                src={imagePath}
                alt={treeName}
                className={`object-contain drop-shadow-md hover:drop-shadow-xl transition-all duration-500 ${isSmall ? 'h-3/4' : 'h-full'}`}
                loading="lazy"
            />
        </div>
    );
};

export default LivingTree;
