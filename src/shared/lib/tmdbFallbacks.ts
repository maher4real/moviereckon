// Keep the public loading experience visual when the catalog API is unavailable.
// Live movie and TV data still requires TMDB_API_KEY; these paths only feed the
// existing same-origin image proxy and are never used as catalog data.
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
] as const;
