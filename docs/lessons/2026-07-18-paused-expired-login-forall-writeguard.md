# Замкнутые (paused_expired) не входят: `FOR ALL` write-guard тайно гейтил SELECT

**Дата:** 2026-07-18
**Фикс:** `migrations/2026-07-18_phase46_profiles_writeguard_split.sql`
**Связано:** phase31 (создал guard'ы), phase35 (self-row exception, оказался аннулирован), [[project_liga_hardlock]].

## Симптом
paused_expired юзер (Громова, muza_skorpi@mail.ru / d427f212) при login видит «Не удалось создать пользователя в новой базе». Массово — все 19 замкнутых после включения жёсткого замка (2026-07-12).

## Корневая причина (owner layer = RLS на `profiles`)
Два RESTRICTIVE-guard'а на profiles:
- `profiles_active_access_guard_select` (SELECT) — phase35 добавил self-row: `((id=auth.uid()) OR has_platform_access(auth.uid()))`.
- `profiles_active_access_guard_write` (phase31) — создан как **`FOR ALL`**, `USING has_platform_access(auth.uid())`.

`FOR ALL` применяет USING и к **SELECT**. RESTRICTIVE склеиваются по **AND**, поэтому эффективный фильтр на чтение:
```
((id=uid) OR hpa) AND (hpa) == hpa
```
У замкнутых `hpa=false` → своя строка не читается, **self-row из phase35 аннулирован** write-guard'ом. `_fetchProfile`→null → `_ensurePostgrestUser` POST → 42501 (write guard) → throw «не удалось создать».

## Почему так получилось / почему не поймали раньше
- phase35 патчил ТОЛЬКО select-guard, не заметив, что соседний write-guard — `FOR ALL`, а не write-only. Дырявая абстракция: «write»-в имени ≠ «только write»-в scope.
- Active/admin (`hpa=true`) проходят оба guard'а → баг был замаскирован. Проявился только когда замок массово наплодил paused_expired, реально пытающихся войти.
- Тесты phase35 в мае, видимо, не гоняли реальный клиентский JWT через PostgREST (проверка была текстовая по policy + смоук, который совпал с hpa=true-путём).

## Как починили
Расщепили `FOR ALL` write-guard на command-specific (`FOR INSERT/UPDATE/DELETE`). SELECT перестал им гейтиться и остался под select-guard (self-row OR hpa). Запись замкнутым сохранена закрытой (hpa-only в USING/WITH CHECK). Правили ТОЛЬКО profiles (у остальных 39 таблиц self-row exception на select нет — замкнутым они не нужны).

## Как проверили (read-only + post-apply, реальный PostgREST с её JWT)
- До: GET own-row `[]`, POST 42501. ROLLBACK-тест: с guard_write own=0, без него own=1.
- После: GET own-row = 1 (paused_expired), GET all = только своя (нет утечки), meetings `[]`, POST/UPDATE не проходят (city не изменился). Active — без регресса.

## Что проверять в будущем (сигналы похожих багов)
- **`FOR ALL` RESTRICTIVE policy молча гейтит SELECT.** Если добавляешь self-row/любое исключение в select-guard — проверь, нет ли рядом `FOR ALL` write-guard'а, который его перекроет по AND. Правило: guard'ы записи делать **write-only** (INSERT/UPDATE/DELETE), а не `FOR ALL`.
- **Верифицируй RLS-фиксы реальным клиентским JWT через PostgREST**, а не только текстом policy и не под gen_user (owner обходит RLS). Минт короткоживущего JWT секретом garden-auth + `curl localhost:3000` — точный репро `_fetchProfile`.
- **Симптом «не удалось создать» у существующего юзера** = `_fetchProfile` вернул null из-за RLS, а не отсутствия строки. Копать RLS на SELECT, а не INSERT.
- Замкнутый должен читать РОВНО свою строку profiles и ничего больше — регрессионный инвариант («безопасность держится»).
