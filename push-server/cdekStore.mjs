/**
 * Реестр заказов СДЭК — маленькое JSON-хранилище рядом с сервисом.
 *
 * Зачем файл, а не таблица: модуль СДЭК намеренно не касается базы Garden.
 * Данных здесь на сотню строк, живут они недели, потеря реестра стоит одного
 * пропущенного напоминания — под такую цену отдельная таблица и миграция
 * дороже задачи.
 *
 * Запись атомарная (во временный файл и переименованием), чтобы обрыв на
 * середине не оставил обрезанный JSON.
 */
import fs from 'fs';
import path from 'path';

/** Заказы старше этого срока выбрасываем: доставленные и возвращённые не нужны. */
const KEEP_DAYS_DEFAULT = 90;

export function createCdekStore({ filePath, keepDays = KEEP_DAYS_DEFAULT, logger = console } = {}) {
  let orders = load(filePath, logger);

  const persist = () => {
    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(orders, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, filePath);
    } catch (e) {
      logger.error('[cdek] не удалось сохранить реестр заказов', e);
    }
  };

  return {
    get(key) {
      return orders[key] || null;
    },
    all() {
      return Object.entries(orders).map(([key, value]) => ({ key, ...value }));
    },
    upsert(key, patch) {
      orders[key] = { ...(orders[key] || {}), ...patch };
      persist();
      return orders[key];
    },
    /** Чистка: закрытые заказы старше keepDays. Вызывается сканером. */
    prune(now = Date.now()) {
      const edge = now - keepDays * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (const [key, order] of Object.entries(orders)) {
        const stamp = Date.parse(order.updatedAt || order.createdAt || '') || 0;
        if (order.closed && stamp && stamp < edge) {
          delete orders[key];
          removed += 1;
        }
      }
      if (removed) persist();
      return removed;
    },
    get size() {
      return Object.keys(orders).length;
    }
  };
}

function load(filePath, logger) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    // Битый файл не должен мешать сервису стартовать: начинаем с чистого.
    logger.error('[cdek] реестр заказов не читается, начинаем заново', e);
    return {};
  }
}
