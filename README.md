# DocBingo

Plateforme de bingo QCM médical (serious game) — création de questions, sessions de bingo paramétrables, grilles PDF à imprimer, animation avec mode présentateur double écran. Interface FR / EN / DE, trois thèmes visuels.

**En ligne : https://docbingo.ch** (hébergement Render, base Turso · domaine Infomaniak).

## Démarrer en local

```bash
npm install
npm run dev        # développement : interface sur :5173, API sur :3001
npm run preview    # production locale : build + serveur sur :3001
```

Sans configuration, la base est un fichier SQLite dans `data/`. Pour peupler une base de démonstration : `node scripts/seed.js` (serveur lancé).

## Production (Render + Turso)

Variables d'environnement :

| Variable | Rôle |
|---|---|
| `TURSO_DATABASE_URL` | URL de la base Turso (`libsql://…`) — à défaut, fichier local |
| `TURSO_AUTH_TOKEN` | Jeton de la base Turso |
| `DOCBINGO_PASSWORD` | Mot de passe du compte administrateur initial (créé au premier démarrage avec `ADMIN_EMAIL` / `ADMIN_NAME`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `APP_URL` | Optionnel — envoi d'emails (mot de passe oublié). Ex. Infomaniak : `mail.infomaniak.com`, 465, adresse email complète, mot de passe de la boîte |

Le fichier `render.yaml` décrit le service (plan gratuit, build `npm install && npm run build`, démarrage `npm start`, health check `/api/ping`). L'application maintient le serveur éveillé pendant l'utilisation (ping toutes les 4 minutes).

## Architecture

- **Frontend** : Vite + Svelte 5, SPA (routeur par hash), i18n FR/EN/DE, thèmes par design tokens CSS. PDF des grilles généré côté navigateur (pdf-lib). Synchronisation présentateur ↔ écran public par BroadcastChannel (fonctionne hors ligne).
- **Backend** : Express 5, base libSQL/SQLite (`@libsql/client`), images stockées en base (BLOB), sauvegarde automatique de l'état de session à chaque question.

## Licence

Code : **AGPL-3.0** (voir `LICENSE`, `NOTICE.md`). Contenu pédagogique partagé : **CC BY-NC-SA 4.0**. © Jean-Baptiste Kern & co-auteurs.

## Référence

Le cahier des charges complet et les maquettes se trouvent dans le projet Claude « Projet Bingo ».
