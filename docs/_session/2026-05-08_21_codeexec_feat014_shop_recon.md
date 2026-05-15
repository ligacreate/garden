# FEAT-014 Магазин — recon отчёт (read-only)

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_20_strategist_feat014_shop_recon_prompt.md`](2026-05-08_20_strategist_feat014_shop_recon_prompt.md)
+ дополнение в чате (оплаты НЕ подключаем; видимость — для всех ролей-подписчиков; роли + RLS + frontend role-check проверить).
**Статус:** read-only recon. Apply / commit / правки кода **не делал**.

---

## TL;DR

- **Schema готова на 90%** для нужд Ольги — есть `image_url`, `price`/`old_price`, `options` (jsonb со структурой `{label, values[]}` — не специфично «размер», generic селектор), `contact_telegram`/`contact_whatsapp`, `link_url`/`promo_code`. **Нет** поля «тип товара»/«способ покупки» и **нет** поля под цифровой товар (`download_url`/`file_url`).
- **CRUD в админке уже работает.** Полная форма в `ShopAdmin` (внутри `views/AdminPanel.jsx:259-481`): создаёт/редактирует/удаляет товары, image-URL paste'ом (без upload'а), options.label + options.values через CSV-строку.
- **Витрина** — `views/MarketView.jsx` (238 строк, отдельный файл). Логика двух кнопок: `hasPromo = Boolean(item.promo_code && item.link_url)` → «Перейти» + промокод; иначе «Связаться» (modal с TG/WhatsApp).
- **Подзаголовок «Товары напрямую от производителя»** хардкодом в [`views/MarketView.jsx:201`](../../views/MarketView.jsx#L201) — `<p className="text-slate-500">Товары напрямую от производителя</p>`. Просто удалить.
- **RLS на shop_items:** `shop_items_select_all USING (true)` — любой authenticated. Запись — `is_admin()`. GRANT: SELECT/INSERT/UPDATE/DELETE → `authenticated`. **Нет ограничения по ролям.**
- **Frontend role-check для магазина:** только в sidebar, и только `!isApplicant`. Route-уровня (`view === 'market'`) и service-уровня — нет. INTERN/LEADER/MENTOR/CURATOR/ADMIN видят сайдбар-пункт «Магазин»; APPLICANT — нет.
- **Конфликт с твоим брифом:** ты сказал «применять видимость для admin, mentor, applicant, intern, ≥ leader», то есть **все subscriber-роли**. Но в коде `utils/roles.js:5` комментарий: «LEADER — Полный доступ (Магазин, CRM)» — оригинальный intent был «магазин для leader+». Сейчас фронт хайдит applicant — частично совпадает с оригинальным intent'ом. Если твоё новое решение «все роли» — нужно убрать гейт `!isApplicant` (или оставить с продуктовым обоснованием). См. секцию 5.

---

## 1. Schema `shop_items` + sample + counts

### 1.1 `\d public.shop_items`

```
Table "public.shop_items"
      Column      |           Type           | Nullable |      Default
------------------+--------------------------+----------+-------------------
 id               | uuid                     | not null | gen_random_uuid()
 name             | text                     | not null |
 description      | text                     |          |
 price            | integer                  |          |
 old_price        | integer                  |          |
 image_url        | text                     |          |
 options          | jsonb                    |          |
 contact_telegram | text                     |          |
 contact_whatsapp | text                     |          |
 sort_order       | integer                  | not null | 0
 is_active        | boolean                  | not null | true
 created_at       | timestamp with time zone | not null | now()
 promo_code       | text                     |          |
 link_url         | text                     |          |
Indexes:
    "shop_items_pkey" PRIMARY KEY, btree (id)
Policies:
    POLICY "shop_items_select_all" FOR SELECT USING (true)
    POLICY "shop_items_write_admin"
      USING (is_admin())
      WITH CHECK (is_admin())
```

### 1.2 Чего нет (для нужд Ольги)

- ❌ **`kind` / `type`** — нет поля для дискриминации «контакт» vs «промокод+ссылка» vs «цифровой товар». Сейчас тип определяется неявно по тому, какие поля заполнены (`hasPromo` логика во фронте — см. секцию 3.2).
- ❌ **`download_url` / `file_url`** — нет поля под цифровой товар (PDF/гайд/чек-лист).
- ❌ **`subtitle` / `tagline`** — нет поля для подписи на витрине. Строка «Товары напрямую от производителя» хардкодом в коде, не в БД.
- ⚠ **`options`** есть (jsonb), но не специфична размерам — это **generic** «label + values[]» селектор. Используется и для размеров футболки, и для материала кейса аромабокса. См. примеры в 1.4.

### 1.3 Counts

```
SELECT count(*) FROM shop_items;  →  4
```

### 1.4 Sample data (4 строки — все товары на проде)

| name | price | old_price | options | contact_telegram | link_url | promo_code | is_active |
|---|---:|---:|---|---|---|---|---|
| Промокод на все вебинары и встречи | — | — | — | — | `https://izdatelstvo.skrebeyko.ru/digital` | `LOVELIGA` | t |
| Футболка «Пиши, веди, люби» | 3500 | 4900 | `{"label":"Размер","values":["XS","S","M","L","XL"]}` | `chufyr` | — | `пиши3500` | t |
| Промокод на блокноты | — | — | — | — | `https://izdatelstvo.skrebeyko.ru/notebooks` | `LIGANOTEBOOKS` | t |
| Ароманабор масел | 2000 | — | `{"label":"Материал кейса","values":["Эко-кожа","Экозамша"]}` | `eleonora_voytovich` | — | — | t |

**Наблюдения:**
- Два «промокод-товара» (без `price`, без `contact_telegram`, есть `link_url` + `promo_code`) → отдают «Перейти + промокод».
- Два «контактных товара» (с `price`, с `contact_telegram`, без `link_url`) → отдают «Связаться».
- `options` — переиспользуется для размеров **и** для материала кейса. Это OK, но если строго фиксировать «размер» — может понадобиться отдельное поле.
- На витрине у «Футболки» есть `promo_code: 'пиши3500'` **и** `contact_telegram: 'chufyr'`, но **нет** `link_url`. Поэтому `hasPromo = false` (нужны оба) → рендерится «Связаться». Промокод не светится. Возможно баг или admin-data inconsistency.

---

## 2. Admin-flow — `ShopAdmin` в AdminPanel.jsx

### 2.1 Где живёт

[`views/AdminPanel.jsx:259-481`](../../views/AdminPanel.jsx#L259-L481) — компонент `ShopAdmin`. Вызывается через [`views/AdminPanel.jsx:1596`](../../views/AdminPanel.jsx#L1596) при `tab === 'shop'`.

### 2.2 Что уже редактируется через UI

Форма в `ModalShell` ([L420-L468](../../views/AdminPanel.jsx#L420-L468)):

| Поле UI | DB-колонка | Тип | Notes |
|---|---|---|---|
| Название * | `name` | text | required |
| Описание | `description` | text | optional |
| Цена (₽) * | `price` | int | required (или `promo_code`) |
| Старая цена (₽) | `old_price` | int | optional |
| Ссылка на фото | `image_url` | text | **paste-only**, нет upload'а |
| Telegram | `contact_telegram` | text | без `@`, добавляется на витрине |
| WhatsApp | `contact_whatsapp` | text | digits-only |
| Промокод | `promo_code` | text | в визуально-выделенной секции |
| Ссылка перехода | `link_url` | text | в той же секции |
| Метка | `options.label` | jsonb path | в отдельной секции |
| Значения через запятую | `options.values` | jsonb path | split by `,`, trim, filter |
| Порядок сортировки | `sort_order` | int | default 0 |
| Активен (виден в магазине) | `is_active` | bool | default true |

### 2.3 Validation в форме

```js
if (!form.name.trim()) { onNotify('Введите название'); return; }
if (!form.price && !form.promo_code.trim()) { onNotify('Укажите цену или промокод'); return; }
```

То есть требуется либо цена, либо промокод. Пустой и без того, и без того — нельзя.

### 2.4 Endpoint'ы

См. секцию 4.

### 2.5 Превью / upload

- ❌ Нет превью карточки внутри admin-формы.
- ❌ Нет upload'а изображения — только paste-URL.
- ✅ В списке товаров (вне модалки) показывается thumbnail (12×12 rounded, `object-cover`).

### 2.6 Что не редактируется через UI (но есть в БД)

- ❌ Нет поля `kind`/`type` (его в БД и нет — см. секцию 1.2).
- ❌ Нет поля для цифрового товара (download_url).

---

## 3. Customer-flow — `views/MarketView.jsx`

### 3.1 Где живёт

`views/MarketView.jsx`, 238 строк. Импортируется в [`views/UserApp.jsx:18`](../../views/UserApp.jsx#L18). Рендерится при `view === 'market'` ([UserApp.jsx:967](../../views/UserApp.jsx#L967)).

### 3.2 Логика двух кнопок («Связаться» vs «Перейти»)

В [`views/MarketView.jsx:53`](../../views/MarketView.jsx#L53):

```js
const hasPromo = Boolean(item.promo_code && item.link_url);
```

Условие требует **оба** поля. Если есть `promo_code`, но нет `link_url` (или наоборот) — кнопка будет «Связаться», и промокод не светится. См. секцию 1.4: «Футболка» с `promo_code: 'пиши3500'` без `link_url` → промокод не показывается.

Render:
- **`hasPromo === true`** (`promo_code` + `link_url`):
  - `<PromoCode code={...} />` — копи-в-буфер кнопка с промокодом.
  - `<a href={link_url} target="_blank">Перейти</a>` — внешняя ссылка.
  - Цена / старая цена **НЕ** показывается.
- **`hasPromo === false`** (всё остальное):
  - Цена + старая цена (если есть) + DiscountBadge (вычисляет `Math.round((1 - price/oldPrice) * 100)` %).
  - Кнопка `<Button onClick={onContact}>Связаться</Button>` → открывает `ContactModal`.
  - В `ContactModal` — TG/WhatsApp кнопки. Если ни одного контакта нет → «Контакты скоро будут добавлены».

### 3.3 Подзаголовок «Товары напрямую от производителя»

[`views/MarketView.jsx:201`](../../views/MarketView.jsx#L201):

```jsx
<div>
    <div className="section-kicker mb-2">для ведущих</div>
    <h1 className="text-3xl font-light text-slate-900 mb-1">Магазин</h1>
    <p className="text-slate-500">Товары напрямую от производителя</p>
</div>
```

Хардкодом, не из БД. Удалить — одна строка.

### 3.4 Размеры (XS/S/M/L/XL)

Не в hardcode и не в отдельной таблице — лежат в `shop_items.options` (jsonb) у конкретного товара. На витрине рендерятся в [`MarketView.jsx:75-95`](../../views/MarketView.jsx#L75-L95):

```jsx
const hasOpts = opts?.label && Array.isArray(opts.values) && opts.values.length > 0;
...
{hasOpts && (
    <div>
        <div>{opts.label}</div>
        <div className="flex flex-wrap gap-2">
            {opts.values.map(v => (
                <button onClick={() => setSelected(v === selected ? null : v)}>{v}</button>
            ))}
        </div>
    </div>
)}
```

Selected value (`selected` state) **не передаётся в URL** «Перейти», но **передаётся** в `ContactModal` как `option` (показывается в description: «Выбрано: M»).

### 3.5 Скидка / старая цена

Считается inline в `<DiscountBadge price={...} oldPrice={...}>`:

```jsx
const pct = Math.round((1 - price / oldPrice) * 100);
```

Не сохраняется — выводится «-N%» бейджем поверх изображения. Поле `old_price` хранит абсолют, процент вычисляется на клиенте.

### 3.6 Skeleton + empty + count

- При `loading` — три `SkeletonCard`'а в grid.
- При empty — иконка `ShoppingBag` + «Товары скоро появятся».
- Счётчик товаров справа от заголовка (только md+).

### 3.7 Layout

`grid-cols-1 md:grid-cols-2 lg:grid-cols-3` — 3 колонки на desktop, 2 на tablet, 1 на mobile.

---

## 4. Service-layer + endpoints + RLS + GRANT

### 4.1 `services/dataService.js`

[`services/dataService.js:1318-1351`](../../services/dataService.js#L1318-L1351):

```js
async getShopItems({ activeOnly = false } = {}) {
    const params = { order: 'sort_order.asc' };
    if (activeOnly) params['is_active'] = 'eq.true';
    const { data } = await postgrestFetch('shop_items', params);
    return data || [];
}

async createShopItem(item) {
    const sanitized = this._sanitizeFields(item, {
        plain: ['name', 'description', 'image_url', 'contact_telegram', 'contact_whatsapp']
    });
    const { data } = await postgrestFetch('shop_items', {}, {
        method: 'POST', body: sanitized, returnRepresentation: true
    });
    return Array.isArray(data) ? data[0] : data;
}

async updateShopItem(id, fields) {
    /* sanitize same plain fields, PATCH eq.id */
}

async deleteShopItem(id) {
    await postgrestFetch('shop_items', { id: `eq.${id}` }, { method: 'DELETE' });
    return true;
}
```

`_sanitizeFields` — рантайм-санитайзер на frontend (что-то вроде trim/whitelist). `promo_code`, `link_url`, `options`, `price`, `old_price`, `sort_order`, `is_active` — НЕ в `plain`-списке (вероятно, они и так структурно безопасны, не текстовые free-form).

`MarketView` использует `getShopItems({ activeOnly: true })` ([L180](../../views/MarketView.jsx#L180)) — **скрытые товары витрине не показываются**. `ShopAdmin` использует `getShopItems()` без `activeOnly` ([L271](../../views/AdminPanel.jsx#L271)) — админ видит все.

### 4.2 PostgREST endpoints (рекап)

| Действие | URL | Method | Headers/Body |
|---|---|---|---|
| List | `/shop_items?order=sort_order.asc` (+ `is_active=eq.true`) | GET | JWT |
| List one | `/shop_items?id=eq.<uuid>` | GET | JWT |
| Create | `/shop_items` | POST | JWT, body item, `Prefer: return=representation` |
| Update | `/shop_items?id=eq.<uuid>` | PATCH | JWT, body fields, `Prefer: return=representation` |
| Delete | `/shop_items?id=eq.<uuid>` | DELETE | JWT |

### 4.3 RLS policies

```
POLICY "shop_items_select_all" FOR SELECT
    USING (true)

POLICY "shop_items_write_admin"
    USING (is_admin())
    WITH CHECK (is_admin())
```

- **SELECT:** `USING (true)` — любой authenticated с GRANT SELECT может читать.
- **INSERT / UPDATE / DELETE:** ALL command (без указания `polcmd` — судя по `polcmd` это «for all» policy), требует `is_admin()`. Не-админ при попытке write получит 403/empty.

### 4.4 GRANT

```
authenticated  | SELECT
authenticated  | INSERT
authenticated  | UPDATE
authenticated  | DELETE
gen_user       | (все, owner)
```

`web_anon` **отсутствует** → анонимные клиенты `meetings.skrebeyko.ru` shop не видят. Только залогиненные на Garden.

### 4.5 Резюме видимости

| Кто | Может ли SELECT через PostgREST? |
|---|---|
| `web_anon` (анонимный пользователь) | ❌ нет (нет GRANT) |
| `authenticated` с любой ролью (`applicant`, `intern`, `leader`, `mentor`, `curator`, `admin`) | ✅ да |
| `authenticated` без `profile.role` (NULL) | ✅ да (RLS не фильтрует), но таких в БД сейчас 0 |

---

## 5. Распределение ролей + frontend role-check

### 5.1 Роли в `profiles` (на 2026-05-08)

```
   role    | count
-----------+-------
 leader    |    18
 applicant |    14
 intern    |    13
 mentor    |     7
 admin     |     3
```

Всего 55 профилей. **Нет** `curator`, **нет** NULL.

Из `utils/roles.js`:

| ROLE | level | label |
|---|---:|---|
| applicant | 0 | Абитуриент |
| intern | 1 | Стажер |
| leader | 2 | Ведущая |
| mentor | 3 | Ментор |
| curator | 4 | Куратор |
| admin | 99 | Главный садовник |

В коде [`utils/roles.js:5`](../../utils/roles.js#L5) комментарий: «LEADER — Уровень 2: Полный доступ (**Магазин**, CRM)». То есть оригинальный design intent — магазин видим **с уровня leader**.

### 5.2 Текущие frontend role-checks для магазина

В `views/UserApp.jsx`:

```js
const isApplicant = normalizedRole === ROLES.APPLICANT;
```

И две точки рендера sidebar-пункта (один для desktop sidebar, один для mobile? — оба гейтят `!isApplicant`):

[`views/UserApp.jsx:732`](../../views/UserApp.jsx#L732):

```jsx
{!isApplicant && (
    <SidebarItem icon={ShoppingBag} label="Магазин" active={view === 'market'} ... />
)}
```

[`views/UserApp.jsx:892`](../../views/UserApp.jsx#L892):

```jsx
{!isApplicant && <SidebarItem icon={ShoppingBag} label="Магазин" ... />}
```

Route-уровень — без гейта:

[`views/UserApp.jsx:967`](../../views/UserApp.jsx#L967):

```jsx
{view === 'market' && <MarketView />}
```

Если applicant как-то поставит `view = 'market'` (через URL hash, history, manual `handleViewChange`) — `MarketView` отрендерится, и данные подгрузятся (RLS не блокирует). То есть скрытие applicant **не от безопасности**, а от UX.

`isApplicant`-гейт **не покрывает** `intern` — то есть стажёры (13 шт.) сейчас видят магазин, хотя по комментарию `roles.js` должно быть «leader+».

### 5.3 Конфликт твоего нового брифа vs существующего intent'а

Ты сказал в чате: **«видимость магазина — для admin, mentor, applicant, intern, и любые другие ≥ leader»** — то есть **все** subscriber-роли. Это шире, чем текущее поведение (которое уже шире, чем `roles.js` intent).

| Роль | По `roles.js` intent (leader+) | По текущему фронту (`!isApplicant`) | По твоему новому брифу |
|---|---|---|---|
| applicant | ❌ нет | ❌ нет | ✅ да |
| intern | ❌ нет | ✅ да | ✅ да |
| leader | ✅ да | ✅ да | ✅ да |
| mentor | ✅ да | ✅ да | ✅ да |
| curator | ✅ да | ✅ да | ✅ да |
| admin | ✅ да | ✅ да | ✅ да |

Если применять твой бриф буквально: **снять гейт `!isApplicant`**, обновить `roles.js` комментарий («Магазин — все subscriber-роли»). Видимость = «authenticated с любой непустой ролью».

⚠ Уточнение от стратега для тебя: **подтвердить** новый бриф vs `roles.js` intent. Возможно, ты имел в виду «оставить как сейчас» (без applicant) — тогда applicant в твоём списке оказался по ошибке. Это open question 6.1.

---

## 6. Open questions (продуктовые + технические)

### 6.1 Видимость для applicant — оставить или открыть?

См. 5.3. Предложение: подтвердить решение продуктово. Если открываем applicant'у — это противоречит `roles.js:5` комментарию, но соответствует твоему брифу.

### 6.2 «Третий тип» — цифровой товар: схема?

Ольга хочет добавить «скачать по ссылке» для гайдов / шаблонов / чек-листов. Варианты:

**Вариант A — добавить колонку `download_url text`** в `shop_items`. Кнопка «Скачать» включается, если `download_url IS NOT NULL`. Минимум миграции (1 ALTER TABLE).

**Вариант B — добавить дискриминатор `kind text` (enum-like)** + `download_url`. Значения `'contact' | 'link' | 'digital'`. Явная дискриминация типа на уровне БД. Чистее, но требует миграции и сопоставления существующих 4 строк.

**Вариант C — переиспользовать `link_url`** для цифровых товаров без `promo_code`: «если есть `link_url` без `promo_code` → "Скачать"». Никакой миграции, но смешивает «download» и «redirect to external store» в одном поле.

Рекомендация: **Вариант A** для MVP — `download_url text` + кнопка «Скачать», логика на фронте `hasDownload = Boolean(item.download_url)`. Если позже разрастётся — заведём `kind`. См. секцию 7.

### 6.3 Upload файлов на сервер для цифровых

Если digital — то URL paste'ом (как сейчас image_url) или upload? В `services/dataService.js` уже есть `_uploadToS3` (используется для других ассетов на Timeweb cloud storage). Можно reuse, но это +форма, +валидация, +UX. Для MVP — paste URL'а на чужой хостинг (Tilda, Yandex Disk public link).

### 6.4 Загрузка изображений в admin form

Сейчас image — paste URL. Это OK работает (в БД 4 строки, все на Tildacdn). Если хотим upload — `_uploadToS3` есть, но MVP можно не трогать.

### 6.5 Размеры — отдельная таблица?

Сейчас `options` jsonb, generic «label + values[]». Это работает и для размеров, и для материала кейса. Отдельная таблица `shop_item_options` смысла не имеет — уровень нормализации не нужен (нет cross-item shared options). **Не трогать.**

### 6.6 Кнопка «Связаться» для товара одновременно с promo_code

См. секцию 1.4 + 3.2: «Футболка» имеет `promo_code: 'пиши3500'` + `contact_telegram: 'chufyr'`, но без `link_url`. `hasPromo` требует оба, и сейчас промокод не светится. Это data-bug или продукт-bug?

- Если data-bug — Ольга должна добавить `link_url` (например, на Wildberries или личный сайт автора).
- Если продукт-bug — переписать `hasPromo` на `Boolean(item.promo_code)` и сделать `link_url` опциональным. Тогда «Связаться» может сосуществовать с промокодом.

### 6.7 RLS-tightening для «только subscriber-роли»

Сейчас RLS = `USING (true)`. Чтобы строго требовать profile.role IS NOT NULL (защита от пустых ролей в будущем), можно:

```sql
CREATE POLICY "shop_items_select_subscriber" ON public.shop_items FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IS NOT NULL));
```

Сейчас защита идёт на уровне GRANT (web_anon без SELECT). Tightening RLS — defense-in-depth. Делать ли — зависит от твоего отношения к «голым» auth-пользователям без profile.role (сейчас их 0). В MVP не критично.

---

## 7. Предварительный план incremental изменений

Ниже — не план apply, а скелет предложений. Стратег ревьюит и утверждает в отдельном промпте `_22`.

### 7.1 Миграция БД (1 коммит-миграция)

`migrations/2026-05-08_phase26_shop_items_digital.sql`:

```sql
ALTER TABLE public.shop_items
    ADD COLUMN IF NOT EXISTS download_url text;

COMMENT ON COLUMN public.shop_items.download_url IS
    'URL для скачивания цифрового товара (PDF/гайд/чек-лист). Если NOT NULL, на витрине рендерится кнопка «Скачать».';
```

(Или вариант B с `kind text` — на твоё решение).

### 7.2 Frontend admin (1 правка `views/AdminPanel.jsx`)

В `ShopAdmin` форме добавить блок «Цифровой товар»:

```jsx
<div className="bg-amber-50/60 rounded-2xl p-4 space-y-3">
    <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        Для цифровых товаров (скачать по ссылке)
    </div>
    <Input label="Ссылка на скачивание" value={form.download_url}
           onChange={f('download_url')}
           placeholder="https://..." />
</div>
```

+ обновить `SHOP_EMPTY_FORM` (`download_url: ''`), `openEdit` (`download_url: item.download_url || ''`), `payload.download_url`, validator (если установлен `download_url` без `name` — стандартный валидатор покрывает).

### 7.3 Frontend витрина (1 правка `views/MarketView.jsx`)

**А.** Удалить подзаголовок строкой 201:

```diff
-<p className="text-slate-500">Товары напрямую от производителя</p>
```

**B.** В `ProductCard` добавить третий рендер-вариант (по приоритету: download → promo → contact):

```jsx
const hasDownload = Boolean(item.download_url);
const hasPromo = Boolean(item.promo_code && item.link_url);

{hasDownload ? (
    <div className="mt-auto pt-2">
        <a href={item.download_url} target="_blank" rel="noopener noreferrer"
           download
           className="btn-primary w-full justify-center">
            <Download size={18} /> Скачать
        </a>
    </div>
) : hasPromo ? (...) : (...)}
```

Плюс импорт `Download` из `lucide-react`.

### 7.4 Видимость для applicant (1 правка `views/UserApp.jsx`)

Если стратег утверждает «applicant тоже видит» (см. 6.1):

```diff
-{!isApplicant && (
-    <SidebarItem icon={ShoppingBag} label="Магазин" ... />
-)}
+<SidebarItem icon={ShoppingBag} label="Магазин" ... />
```

В двух местах ([L732](../../views/UserApp.jsx#L732), [L892](../../views/UserApp.jsx#L892)). Plus обновить комментарий в `roles.js:5` — убрать «Магазин» из списка leader-привилегий.

### 7.5 RLS tightening (опционально, отдельным коммитом)

См. 6.7. Не критично для MVP.

### 7.6 Что НЕ делаем (по твоему дополнению)

- ❌ Биллинг / Prodamus / интеграция с оплатами.
- ❌ Корзина / cart.
- ❌ Storage upload в S3 для цифровых товаров (paste-URL pattern).
- ❌ Email-доставка цифрового товара.
- ❌ Отдельная таблица для размеров.

---

## Итог

Реализация магазина уже на 70% готова — admin CRUD, витрина с двумя кнопками, RLS, GRANT. Не хватает третьего типа («цифровой товар»), уборки подзаголовка, и продуктового решения по видимости applicant. Миграция минимальна (одна `ALTER TABLE` колонка), фронт-правок ~3 файла на ~50-80 строк суммарно. Без оплат, без upload'а, без новых таблиц.

Жду 🟢 на план с уточнением:
- 6.1 (видимость applicant)
- 6.2 (схема цифрового товара — A/B/C)
- 6.6 (`hasPromo` у Футболки — data-bug или продукт-bug)
