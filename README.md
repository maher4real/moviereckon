# 🎬 MovieReckon

**Live Demo:** https://moviereckon.vercel.app/

MovieReckon is a **personalized movie & TV series discovery web app** that offers Netflix-style recommendations, dynamic content filtering, and user-driven recommendations based on watch history and interactions.
<img width="1724" height="911" alt="Screenshot 2026-02-01 at 5 43 09 pm" src="https://github.com/user-attachments/assets/b8aa225c-b976-4e23-827d-ff873c3f27be" />
<img width="1728" height="909" alt="Screenshot 2026-02-01 at 5 44 16 pm" src="https://github.com/user-attachments/assets/66ac84f0-389f-4754-9c8d-1ab7040daedd" />
<img width="1728" height="913" alt="Screenshot 2026-02-01 at 5 43 51 pm" src="https://github.com/user-attachments/assets/ed6774e4-a748-4ff8-aa79-b36d1a2ecf88" />
<img width="1728" height="897" alt="Screenshot 2026-02-01 at 5 46 48 pm" src="https://github.com/user-attachments/assets/e477b6cf-e998-44a9-abac-8c788b8919bc" />
<img width="1728" height="909" alt="Screenshot 2026-02-01 at 5 44 16 pm" src="https://github.com/user-attachments/assets/8729ccaa-a51c-4753-8a4d-aa8f4969cb70" />
<img width="1728" height="908" alt="Screenshot 2026-02-01 at 5 47 26 pm" src="https://github.com/user-attachments/assets/3f8790ab-073a-491d-9b85-1ce710bb5102" />
<img width="1660" height="899" alt="Screenshot 2026-02-01 at 5 47 46 pm" src="https://github.com/user-attachments/assets/50a274d0-834a-4fa6-b0a3-619bdff68412" />

---

## 🚀 Features

### ✨ Core Features
- **Now Playing, Trending & Upcoming** sections with TMDB data
- **Personalized recommendations** based on user behavior
- **“Reckon” page**: main recommendation feed tailored to each user
- **Authentication** with user persistence (login/logout)
- **Mark as Watched / Like interactions**
- **Filters & sorting** (genre, popularity, date, etc.)
- **Responsive UI** with consistent theming and animations

### 🧠 Smart Recommendation System
MovieReckon’s recommendation engine uses a hybrid algorithm combining:
- **Content similarity** (genre, language, cast, keywords)
- **Behavior signals** (likes, watch history, recency)
- **Diversity & exploration** (avoid repetitive suggestions)
- **Trending fallback** (if user data is limited)

This ensures personalized, relevant, and vibrant recommendations similar to modern streaming platforms.

### 🧮 Weighted Content + Smart Ranking + Explainability (v2)
The production recommendation engine is implemented in `src/lib/recommendation/` and consumed by `src/hooks/useRecommendations.tsx`.

- Entry points:
  - `getRecommendations(seedItems, candidateItems, userContext?)`
  - `scoreCandidate(seedItem, candidateItem, userContext?)`
  - `explainRecommendation(seedItem, candidateItem, scoreBreakdown)`
- Candidate sources are merged from:
  - TMDB similar/recommendations per seed
  - Trending (week) for movie + tv
  - Discover by top seed genres
  - Optional discover-by-people (director/creator IDs)
- The ranked feed now includes per-card explainability via a `Why?` popover on the Reckon page.

#### Tuning Weights
Base scoring weights live in `src/lib/recommendation/types.ts` (`DEFAULT_RECOMMENDATION_WEIGHTS`):

- `genre`: 0.30
- `keywords`: 0.25
- `people`: 0.15
- `year`: 0.07
- `runtime`: 0.05
- `quality`: 0.10
- `popularity`: 0.08
- `noveltyBoost`: 0.05 (post-base boost for unseen items)

Notes:
- Base weights are normalized internally so they remain stable if you tweak values.
- `quality` uses vote-average plus vote-count confidence to avoid tiny-sample inflation.
- `popularity` uses log scaling and caps outliers.

#### How Reasons Are Generated
`explainRecommendation(...)` generates 2–3 concise reasons from the strongest matched signals, prioritized as:

1. Same director / creator
2. Shared genres
3. Shared lead cast
4. Similar themes (keywords/tokens)
5. Highly rated / similar era / popularity fallback

#### Adding New Signals Later
To add a signal (for example language affinity, country preference, providers):

1. Extend `ScoreBreakdown` in `src/lib/recommendation/types.ts`.
2. Add normalized feature extraction in `src/lib/recommendation/normalizers.ts`.
3. Add weighted score contribution in `src/lib/recommendation/scoring.ts`.
4. Optionally include new explainability lines in `explainRecommendation(...)`.
5. Add/adjust tests in `src/test/recommendation-engine.test.ts`.

---

## 🎨 UI & Design

- Consistent **red-themed button styles and interactions**
- Smooth animations for buttons (like, watched, trailer)
- Polished category chips and detail page UI
- Clean responsive layout for mobile and desktop
- Pagination with row-per-page controls

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite |
| Styling | Tailwind CSS |
| Backend | Node.js (API layer with MongoDB) |
| Database | MongoDB |
| Data Source | TMDB API |
| Deployment | Vercel |

---

## 📦 Installation

To run this project locally:

1. Clone the repo  
   ```bash
   git clone https://github.com/<your-username>/moviereckon.git
   cd moviereckon
