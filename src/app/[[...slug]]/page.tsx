import type { Metadata } from "next";
import { getServerMovieDetails, getServerTVShowDetails } from "@/backend/services/tmdbServer";
import SpaPage from "@/frontend/app/SpaPage";
import { buildRouteMetadata, pathFromSlug } from "@/frontend/app/routeMetadata";

export const dynamic = "force-dynamic";

// Keep this short: TMDB responses are cached by Next, but a cold lookup must not
// delay the document. On timeout the page falls back to a generic title.
const METADATA_TIMEOUT_MS = 1500;

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  return buildRouteMetadata(pathFromSlug(slug), {
    movie: async (id) => {
      const movie = await getServerMovieDetails(id, METADATA_TIMEOUT_MS);
      return { title: movie.title, overview: movie.overview, posterPath: movie.poster_path, year: movie.release_date?.slice(0, 4) };
    },
    tv: async (id) => {
      const show = await getServerTVShowDetails(id, METADATA_TIMEOUT_MS);
      return { title: show.name, overview: show.overview, posterPath: show.poster_path, year: show.first_air_date?.slice(0, 4) };
    },
  });
}

export default SpaPage;
