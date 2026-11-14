# ⚽ Matchday Draft

![Checks](https://github.com/KeeratBrar007/matchday-draft/actions/workflows/checks.yml/badge.svg)

**Live app:** https://keeratbrar007.github.io/matchday-draft/

Matchday Draft is a web app for running a weekly pickup game with friends. It covers who's playing, building fair teams, scoring, and splitting the turf money, so the group doesn't need WhatsApp polls, spreadsheets and mental maths.

It's a single HTML file that installs on a phone like an app. Everyone's phone stays in sync in real time through Firebase.

---

## Features

**Who's playing**
- "Who's in?" polls that replace the WhatsApp poll, with one or more time slots (always including "No"), one-tap vote links for WhatsApp, and a "seen but not replied" list.
- One tap re-creates last week's poll for the same day next week.
- Today's player list updates itself from the poll.

**Fair teams**
- Player database with positions and skill ratings per sport. Drag to reorder, and drag across the list to select many players at once.
- Auto-balanced teams, or a live captains' auction where captains bid any amount from their own phones.
- Guests, tagged with whose guest they are (one player, several, or everyone).

**Matches and stats**
- Live scoring: big +1 buttons during the match that update every phone, and the result saves itself at full time.
- Match history, leaderboards, player-of-the-match voting, rivalries, attendance and seasons.

**Multiple sports**
- Football, cricket, basketball and pickleball, each with its own theme, background, positions, abilities and stats (goals/assists, runs/wickets, points/rebounds, etc.).
- Each game has its own player list. Friends only see the games they've been added to.

**Turf money**
- Split costs equally or with custom amounts, including things players paid for themselves (like water).
- Mark who's paid, before or after sending the breakdown.
- Friends see what they owe, with a UPI pay link and a QR code for the exact amount.
- WhatsApp nudges for anyone who still owes.

**Host controls**
- One host, unlocked with a private host link; everyone else logs in with just their name (optional PIN).
- Backup and restore of all data.

---

## How it's built

| Part | What's used |
|---|---|
| App | One self-contained `index.html` (plain HTML, CSS and JavaScript, no framework or build step) |
| Install / offline | Web app manifest + service worker (installable PWA with update prompts) |
| Database | Firebase Cloud Firestore with real-time listeners |
| Sign-in | Firebase anonymous auth; the host proves a private code once per phone |
| Security | Firestore security rules: only the host can change data, friends can only change their own answers, and each phone can only read the games its player is in |
| QR codes | Generated in the browser (bundled MIT-licensed encoder) |
| Hosting | GitHub Pages, published by GitHub Actions |

The host code is never stored in the app. The app only contains a SHA-256 fingerprint of it, and the real check happens in the database rules.

---

## Automatic tests

Every push to `main` runs the full test suite on GitHub Actions before the site goes live (see [`.github/workflows/checks.yml`](.github/workflows/checks.yml)):

- **17 end-to-end suites (about 470 checks)** written with [Playwright](https://playwright.dev). They drive the app on emulated iPhones, with several phones (host and friends) open at once.
- The tests run against a **mock Firestore** that enforces the same rules as the real database, so they also check that friends *can't* do things they shouldn't, like editing results, reading other games, or claiming to be the host.
- Every suite runs twice, once under the current database rules and once under the game-privacy rules.
- The site is published only if everything passes. A failed run leaves the last good version live, and the logs and screenshots are kept as build artifacts.

Run them locally:

```bash
cd tests
npm install && npx playwright install chromium
pip install opencv-python-headless   # used to scan the generated UPI QR codes
python3 prepare.py                   # builds a test copy of the app that uses the mock database
bash run.sh current                  # or: bash run.sh privacy
```

---

## Repository layout

```
index.html              the whole app
sw.js                   service worker (offline + updates)
manifest.webmanifest    install info and icons
*.png                   app icons
tests/                  Playwright suites, mock database, test runner
.github/workflows/      check-and-publish workflow
```

---

## Using it for your own group

1. Create a free Firebase project with Firestore and anonymous sign-in turned on.
2. Put your project's web config into `FIREBASE_CONFIG` in `index.html`.
3. Pick a host code. Put its SHA-256 into `HOST_HASH` in `index.html`, and the code itself into your Firestore security rules (never into the repository).
4. Host the files on GitHub Pages (or any static host) and open `your-site/#host=YOUR_CODE` once on the host's phone.

---

Built by Keerat Brar.
