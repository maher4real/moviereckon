# MovieReckon - Movie & TV Recommendation Platform

A Netflix-inspired, mobile-first movie and TV series recommendation website featuring both **Bollywood** and **Hollywood** content equally, powered by TMDB.

---

## 🎯 Overview

**MovieReckon** is a sleek, dark-themed streaming-style interface where users can discover movies and TV series from both Indian cinema and Hollywood, with personalized recommendations based on their watch history. No login required - just enter your name and start exploring!

---

## 📱 User Experience Flow

### 1. Welcome/Onboarding Screen
- Clean, cinematic entry screen with the MovieReckon logo
- Simple name input field with "Continue" button
- If returning user detected, show "Welcome back, [Name]" with option to switch users
- Smooth fade transition into the main app

### 2. Home Page - The Discovery Hub
- **Hero Banner** (auto-rotating every 5 seconds)
  - Featured trending movies from both Bollywood AND Hollywood
  - Large backdrop image with title, brief synopsis, and "View Details" button
  - Progress dots/indicators for navigation

- **Recommendation Carousels** (smooth horizontal scroll):
  - 🔥 **Trending Now** - Mix of Bollywood & Hollywood trending
  - ⭐ **Recommended for You** - Based on watch history & preferences
  - 🎬 **Because You Watched [Movie Name]** - Similar content suggestions
  - 🇮🇳 **Bollywood Hits** - Popular Hindi language films
  - 🎬 **Hollywood Blockbusters** - Popular English language films
  - 📺 **Trending TV Series** - Web series and shows from both industries
  - 🌟 **Top Rated** - Highest rated across all content

### 3. Content Detail Page
- Full-screen backdrop with gradient overlay
- Movie/series poster, title, year, rating, runtime
- Genre tags and language indicator (Hindi/English badge)
- Synopsis/overview
- **Embedded YouTube trailer** (from TMDB video data)
- Cast section with profile images
- "Mark as Watched" and "Like" buttons
- **Similar Titles carousel** - TMDB recommendations
- Back navigation with smooth transitions

### 4. Browse/Explore Page
- Category tabs: **All | Bollywood | Hollywood | TV Series**
- **Filter Panel**:
  - Genre dropdown (Action, Drama, Romance, Thriller, Comedy, etc.)
  - Language filter (Hindi, English, All)
  - Year range slider
  - Sort by: Popularity, Rating, Release Date
- Grid view of results with poster cards
- Infinite scroll or pagination

### 5. Search Page
- Prominent search bar with instant results
- Search across movies and TV series (both industries)
- Filter by content type and language
- Recent searches saved locally

### 6. Profile/History Page
- User greeting and avatar placeholder
- Watch history grid
- Liked content section
- Option to clear history or switch user
- Stats: "You've watched X movies this month"

---

## 🎨 Design & UI Details

### Color Palette (Netflix-inspired Dark Theme)
- **Background**: Deep black (#0a0a0a) to charcoal (#141414)
- **Primary Accent**: Vibrant red (#E50914)
- **Secondary**: Electric blue for Hollywood feel (#3B82F6)
- **Tertiary**: Warm gold accent (#F59E0B)
- **Text**: White (#FFFFFF) and muted gray (#A3A3A3)
- **Cards**: Dark gray with subtle borders (#1F1F1F)

### Visual Elements
- Poster cards with rating badges (TMDB score)
- Language badges (🇮🇳 Hindi / 🇺🇸 English)
- Hover effects: Scale up, glow, show "Play" overlay
- Smooth skeleton loaders while fetching
- Backdrop blur effects for overlays
- Mobile-friendly touch carousels

### Responsive Breakpoints
- **Mobile** (< 640px): Single column, stacked layout, thumb-friendly cards
- **Tablet** (640px - 1024px): 2-3 column grids, larger hero
- **Desktop** (> 1024px): Full Netflix-style experience, 4-6 cards per row

---

## 🧠 Recommendation Logic

### How Recommendations Work
1. **Watch History Analysis**
   - Track genres of watched content
   - Track language preferences (Bollywood vs Hollywood)
   - Note frequently watched actors/directors

2. **Recommendation Sources**
   - **TMDB Similar Movies** endpoint for "Because You Watched X"
   - **TMDB Recommendations** endpoint for general suggestions
   - **Genre Matching**: Suggest movies from user's top 3 genres
   - **Language Balance**: Recommend from both industries based on history

3. **Initial State (New Users)**
   - Show balanced trending from both Bollywood & Hollywood
   - Popular content across categories
   - Featured picks from both industries

---

## 🔧 Technical Architecture

### Data Flow
```
User → App → TMDB API → Display
         ↓
   Local Storage (user data, preferences, cache)
```

### TMDB API Integration
- **Bollywood Content**: `with_original_language=hi` + `region=IN`
- **Hollywood Content**: `with_original_language=en` + `region=US`
- **Trending**: Combined trending from both regions
- **Search**: Multi-language search support

### Key Technical Features
- **TMDB Integration Layer**: Centralized API service
- **Response Caching**: Cache popular/trending data via React Query
- **User Data Store**: LocalStorage for username, watch history, likes
- **Debounced Search**: Prevent API spam during typing
- **Image Optimization**: Use TMDB's responsive image URLs

---

## 📄 Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Welcome | Name input for new users, redirect for returning |
| `/home` | Home | Main discovery page with carousels |
| `/browse` | Browse | Filterable content exploration |
| `/browse/bollywood` | Bollywood | Bollywood-focused browsing |
| `/browse/hollywood` | Hollywood | Hollywood-focused browsing |
| `/browse/tv` | TV Series | TV shows browsing |
| `/search` | Search | Search functionality |
| `/movie/:id` | Movie Detail | Full movie information + trailer |
| `/tv/:id` | TV Detail | Full series information + trailer |
| `/profile` | Profile | User history and preferences |

---

## 🚀 Features Summary

1. **Polished Onboarding** - Seamless name-based user identification
2. **Netflix-Quality UI** - Dark theme, smooth animations, professional feel
3. **Dual Industry Focus** - Equal prominence for Bollywood AND Hollywood
4. **Smart Recommendations** - Personalized content based on viewing habits
5. **Full TMDB Integration** - Real movie data, posters, trailers, ratings
6. **Complete Browsing** - Search, filter, explore across both industries
7. **Responsive Design** - Beautiful on mobile, tablet, and desktop
8. **Watch History** - Track and display what you've seen
9. **YouTube Trailers** - Embedded trailer playback on detail pages
10. **Language Indicators** - Clear Hindi/English badges on content

---

*MovieReckon - Your gateway to the best of Bollywood AND Hollywood!* 🎬🍿
