---
title: Infrastructure Map — Garden
type: infrastructure documentation
version: 1.0
created: 2026-05-02
status: draft, требует ревизии
---

# Карта инфраструктуры Garden

## Серверы

### Mysterious Bittern (Timeweb)
- **IP:** 5.129.251.56
- **Hostname:** msk-1-vm-423o
- **Регион:** Москва
- **Конфиг:** 1 CPU, 1 GB RAM, 15 GB NVMe
- **Что крутит:**
  - Caddy (reverse proxy, /etc/caddy/Caddyfile, systemd)
  - PostgREST (api.skrebeyko.ru)
  - Auth-service (auth.skrebeyko.ru, /opt/garden-auth, Express)
  - PostgreSQL (предположительно — нужно подтвердить)
  - Push-server (предположительно — нужно подтвердить)
- **Домены, которые на нём:**
  - api.skrebeyko.ru
  - auth.skrebeyko.ru

### Inventive Cetus (Timeweb)
- **IP:** 92.63.176.211
- **Hostname:** spb-3-vm-mwcd
- **Регион:** Санкт-Петербург
- **Конфиг:** 1 CPU, 1 GB RAM, 15 GB NVMe
- **Статус:** ❓ НЕИЗВЕСТНО — что на нём крутится
- **Действие:** провести аудит, определить — нужен или удалить

## Внешний хостинг

### skrebeyko.ru (фронтенд)
- **IP:** 185.215.4.44
- **Провайдер:** ❓ требует выяснения (возможно, Vercel/Netlify/другой VPS)
- **Что хостит:** SPA-фронтенд платформы

## Открытые задачи

- [ ] Зайти на Inventive Cetus, выяснить, что на нём крутится
- [ ] Решить: нужен ли Inventive Cetus или можно удалить (экономия)
- [ ] Уточнить, на каком провайдере хостится skrebeyko.ru
- [ ] Документировать процесс деплоя (как обновляется фронт/бэк)
- [ ] Документировать backup-стратегию (что бэкапится, куда, как часто)
- [ ] Документировать процесс восстановления при падении
