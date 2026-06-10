// Стадии роста дерева в Саду — единый источник правды.
// Дерево растёт ПО СЕМЕНАМ (не по времени): 7 стадий, картинки /trees/tree-N.png.
// Используется в StatsDashboardView (мой сад) и MapView (режим «Сад»).
export const getTreeStage = (s) => {
    if (s < 150) return { name: 'Семечко', next: 150, image: '/trees/tree-1.png' };
    if (s < 500) return { name: 'Росток', next: 500, image: '/trees/tree-2.png' };
    if (s < 1500) return { name: 'Саженец', next: 1500, image: '/trees/tree-3.png' };
    if (s < 3500) return { name: 'Молодое дерево', next: 3500, image: '/trees/tree-4.png' };
    if (s < 7000) return { name: 'Крепкое дерево', next: 7000, image: '/trees/tree-5.png' };
    if (s < 12000) return { name: 'Раскидистое дерево', next: 12000, image: '/trees/tree-6.png' };
    return { name: 'Плодоносящее дерево', next: 100000, image: '/trees/tree-7.png' };
};
