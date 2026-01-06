# GitHub Pages Deployment Guide

## Първоначална настройка

1. Инсталирай зависимостите:
```bash
npm install
```

2. Тествай локално:
```bash
npm run dev
```

## Деплой в GitHub Pages

### Опция 1: Автоматичен деплой с gh-pages

1. Инсталирай `gh-pages` глобално (ако не е вече инсталиран):
```bash
npm install -g gh-pages
```

2. Деплой:
```bash
npm run deploy
```

Това ще:
- Създаде production build
- Публикува `dist` папката в `gh-pages` branch
- GitHub Pages автоматично ще сервира сайта

### Опция 2: Ръчен деплой

1. Създай build:
```bash
npm run build
```

2. Копирай съдържанието на `dist` папката в root на `gh-pages` branch или в `docs` папка в main branch.

## Настройка на GitHub Pages

1. Отиди в GitHub repository settings
2. Отиди в "Pages" секцията
3. Избери source branch: `gh-pages` (или `main` ако използваш `docs` папка)
4. Избери `/ (root)` като папка

## Важни бележки

- Снимките трябва да са в `public/img/` папката (не в `src/`)
- Всички статични файлове трябва да са в `public/` папката
- След всеки деплой, GitHub Pages може да отнеме няколко минути да обнови сайта


