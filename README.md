# 🎵 SoundCheck

> **A music discovery and review platform where friends rate music and artists, like IMDB for music.**

![screenshot](./screenshots/explore_music_desktop.png)

---

## ✨ Features

* ▶️ **Search and Discover:** Explore recent releases by searching for the artist or title, as well as using the Friends and Artist feeds.
* 🔍 **Marquee of new music:** Auto-refreshing preview carousel of weekly releases.
* 🔊 **Review Anything:** Rate and comment on albums, singles, or artists.
* ⭐ **Fuzzy Deduplication:** Prevents duplicate reviews across song vs single vs album releases.
* 👥 **Social Layer:** Add friends, view their activity feed, and like their reviews.
* 💎 **Profile Stats:** Track your top artists, genres, and reviews by type.
* 🚀 **Mobile-first:** Fully responsive layout with gesture-optimized navigation.
* 🏠 **Authentication:** Supports both email/password and Google OAuth login.

---

## 📊 Screenshots

| Explore                                            | Review Page                                     | Activity Feed                                   | Profile                                    |
| -------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| <img width="383" height="834" alt="image" src="https://github.com/user-attachments/assets/e39613d6-5a22-4864-8753-a3e25a26d84e" />

 | <img width="391" height="845" alt="image" src="https://github.com/user-attachments/assets/bcb05c07-d1b4-4348-90f6-490f929e3acc" />
 | <img width="382" height="841" alt="image" src="https://github.com/user-attachments/assets/0a65d847-4485-41b1-abd8-5a63c1a3e348" />
 | <img width="389" height="842" alt="image" src="https://github.com/user-attachments/assets/cfeadb79-1503-47b3-b0f9-28fa6e2da742" />
 |

---

## 🚀 Tech Stack

| Frontend         | Backend           | Database     | Infra/Other         |
| ---------------- | ----------------- | ------------ | ------------------- |
| Angular + TS     | Node.js + Express | MongoDB      | Render.com          |
| TailwindCSS      | Redis (caching)   |              | Deezer API (music)  |
| JWT Auth + OAuth | REST API          |              | GitHub Actions (CI) |

---

## 🚫 Preventing Review Dupes

Reviews are deduplicated across different Deezer IDs for the **same song content**:

* Tracks released as both singles and albums won't be reviewed twice.
* Fuzzy matching + normalization ensures consistent review logic.

---

## ⚡ Getting Started (Local Dev)

```bash
# Clone
$ git clone https://github.com/graham2413/soundcheck.git
$ cd soundcheck

# Frontend
$ cd frontend
$ npm install && npm start

# Backend
$ cd ../backend
$ npm install
$ npm run dev
```

**Environment variables required:**

* `.env` for backend:

  * `MONGO_URI=...`
  * `REDIS_URL=...`
  * `GOOGLE_CLIENT_ID=...`
  * `GOOGLE_CLIENT_SECRET=...`
  * etc.

---

## 🌐 Live Demo - https://di5r6h6unwhwg.cloudfront.net

Backend Hosted on **Render**

Frontend hosted on AWS **Cloudfront**
---

## 🌟 Author

Built with passion by [Graham Norris](https://github.com/graham2413)

If you find this project interesting, feel free to star it ⭐ or reach out!
