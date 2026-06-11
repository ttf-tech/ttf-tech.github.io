# Taiwan Tech France 🇹🇼🇫🇷

Community hub for Taiwanese tech professionals in France — sharing job opportunities, events, resources, and surveys.

Live site: [ttf-tech.github.io](https://ttf-tech.github.io)

## What this site does

- Lists job offers and freelance missions shared within the community
- Publishes upcoming events and meetups
- Hosts community surveys with live results (Firebase Realtime Database)
- Provides resources and practical info for living and working in France
- Presents the association's goals and how to join

## Site structure

```
ttf-tech.github.io/
├── index.html          # Home — hero, events preview, jobs preview, community charts
├── events.html         # Agenda — upcoming and past events
├── jobs.html           # Job board — CDI, freelance, missions
├── resources.html      # Docs & useful links
├── vote.html           # Community surveys — vote and view live results
├── association.html    # Association info (Loi 1901)
├── admin.html          # Password-protected admin dashboard
│
└── assets/
    ├── css/
    │   └── stastic_member.css   # Shared styles (sidebar, footer, cards)
    └── js/
        ├── firebase-read.js     # Firebase subscription + shared data helpers
        └── stastic_member.js    # Member list and shared UI utilities
```

## Tech stack

- Plain HTML/CSS/JS — no build step
- [Tailwind CSS](https://tailwindcss.com) via CDN
- [Chart.js](https://www.chartjs.org) for survey charts
- [Firebase Realtime Database](https://firebase.google.com/products/realtime-database) for live data (members, jobs, events, votes)
- [Font Awesome](https://fontawesome.com) for icons

## Data model (Firebase `grp_hub_v2`)

All data lives in a single JSON blob under the key `data`:

| Field           | Description                              |
|----------------|------------------------------------------|
| `addedMembers`  | Admin-validated member list              |
| `announcements` | Events / meetups                         |
| `jobs`          | Job offers shared by the community       |
| `surveyVotes`   | Votes per survey per member              |
| `userSurveys`   | Admin-created surveys (shown on vote page and index once ≥10 votes) |
| `sharings`      | Resource links                           |

## Local development

```bash
python3 -m http.server 8080
# open http://localhost:8080
```
