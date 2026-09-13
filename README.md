# 🎵 SoundCheck

> **A music discovery and review platform where friends rate music and artists, like IMDB for music.**

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

### 🔍 Explore Music
<img src="https://github.com/user-attachments/assets/e39613d6-5a22-4864-8753-a3e25a26d84e" width="300" />

### ⭐ Review Modal
<img src="https://github.com/user-attachments/assets/bcb05c07-d1b4-4348-90f6-490f929e3acc" width="300" />

### 👥 Friend and Artist Feeds
<img src="https://github.com/user-attachments/assets/0a65d847-4485-41b1-abd8-5a63c1a3e348" width="300" />
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://github.com/user-attachments/assets/0a65d847-4485-41b1-abd8-5a63c1a3e348" width="300" />

### 🙋‍♂️ Profile Page
<img src="https://github.com/user-attachments/assets/cfeadb79-1503-47b3-b0f9-28fa6e2da742" width="300" />


---

## 🚀 Tech Stack

| Frontend         | Backend           | Database     | Infra/Other         |
| ---------------- | ----------------- | ------------ | ------------------- |
| Angular + TS     | Node.js + Express | MongoDB      | Render.com          |
| TailwindCSS      | Redis (caching)   |              | Deezer API (music)  |
| JWT Auth + OAuth | REST API          |              | GitHub Actions (CI) |

---


## 🌐 Live Demo 

➡️ [SoundCheck](https://di5r6h6unwhwg.cloudfront.net)

Backend Hosted on **Render** and 
Frontend hosted on **AWS Cloudfront**

## Push Notifications

The PWA supports opt-in Web Push notifications for music and cinema releases.
For production delivery, generate one VAPID key pair and configure these
backend environment variables without committing the private key:

```text
VAPID_SUBJECT=mailto:admin@example.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

Set the matching public key in both frontend environment files as
`vapidPublicKey`. iPhone users must install the PWA from Safari to the Home
Screen before enabling notifications.

---

## 🌟 Author

Built with passion by [Graham Norris](https://github.com/graham2413)

If you find this project interesting or have feature or enhancement suggestions, feel free to star it ⭐ or reach out!
