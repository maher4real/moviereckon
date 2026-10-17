// Keep the public loading experience visual when the catalog API is unavailable.
// Live movie and TV data still requires TMDB_API_KEY; these paths only feed the
// existing same-origin image proxy and are never used as catalog data.
// Every entry was checked against the TMDB image CDN. Keep at least 18 so the
// loading poster wall can fill three rows without repeating a poster.
export const TMDB_FALLBACK_POSTERS = [
  {
    path: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
    title: "The Shawshank Redemption",
    eyebrow: "Cinema classic",
  },
  {
    path: "/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg",
    title: "Deadpool & Wolverine",
    eyebrow: "Tonight's pick",
  },
  {
    path: "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
    title: "Dune: Part Two",
    eyebrow: "Made for your mood",
  },
  {
    path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    title: "Interstellar",
    eyebrow: "Smart sci-fi",
  },
  {
    path: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    title: "Inception",
    eyebrow: "A confident choice",
  },
  {
    path: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    title: "The Matrix",
    eyebrow: "Rewatch-worthy",
  },
  {
    path: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
    title: "Pulp Fiction",
    eyebrow: "Cinema classic",
  },
  {
    path: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
    title: "The Godfather",
    eyebrow: "A true classic",
  },
  {
    path: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    title: "Fight Club",
    eyebrow: "Cult favourite",
  },
  {
    path: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
    title: "Forrest Gump",
    eyebrow: "Feel-good pick",
  },
  {
    path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    title: "The Dark Knight",
    eyebrow: "Crowd favourite",
  },
  {
    path: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    title: "Parasite",
    eyebrow: "World cinema",
  },
  {
    path: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    title: "Spirited Away",
    eyebrow: "Animated favourite",
  },
  {
    path: "/aKuFiU82s5ISJpGZp7YkIr3kCUd.jpg",
    title: "Goodfellas",
    eyebrow: "Cinema classic",
  },
  {
    path: "/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg",
    title: "Gladiator",
    eyebrow: "Epic night in",
  },
  {
    path: "/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
    title: "Avengers: Endgame",
    eyebrow: "Blockbuster pick",
  },
  {
    path: "/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg",
    title: "Star Wars",
    eyebrow: "Cinema classic",
  },
  {
    path: "/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg",
    title: "The Lord of the Rings: The Return of the King",
    eyebrow: "Epic night in",
  },
  {
    path: "/74xTEgt7R36Fpooo50r9T25onhq.jpg",
    title: "The Batman",
    eyebrow: "Dark and gripping",
  },
  {
    path: "/rktDFPbfHfUbArZ6OOOKsXcv0Bm.jpg",
    title: "The Flash",
    eyebrow: "Fast and fun",
  },
] as const;
