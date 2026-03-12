import { memo } from "react";
import { ExternalLink } from "lucide-react";
import { WatchProvider, getProviderLogoUrl } from "@/shared/lib/tmdb";
import MediaImage from "@/frontend/components/MediaImage";

interface WhereToWatchProps {
  providers: {
    flatrate?: WatchProvider[];
    rent?: WatchProvider[];
    buy?: WatchProvider[];
  } | null;
  link?: string;
}

const providerUrls: Record<string, string> = {
  "Netflix": "https://www.netflix.com",
  "Amazon Prime Video": "https://www.primevideo.com",
  "Disney Plus": "https://www.disneyplus.com",
  "Hotstar": "https://www.hotstar.com",
  "JioCinema": "https://www.jiocinema.com",
  "Zee5": "https://www.zee5.com",
  "SonyLIV": "https://www.sonyliv.com",
  "Voot": "https://www.voot.com",
  "MX Player": "https://www.mxplayer.in",
  "YouTube": "https://www.youtube.com",
  "Apple TV Plus": "https://tv.apple.com",
  "Hulu": "https://www.hulu.com",
  "HBO Max": "https://www.max.com",
  "Paramount Plus": "https://www.paramountplus.com",
  "Peacock": "https://www.peacocktv.com",
};

function WhereToWatch({ providers, link }: WhereToWatchProps) {
  if (!providers) return null;

  const allProviders = [
    ...(providers.flatrate || []),
    ...(providers.rent || []),
    ...(providers.buy || []),
  ];

  // Deduplicate providers by id
  const uniqueProviders = allProviders.filter(
    (provider, index, self) =>
      index === self.findIndex((p) => p.provider_id === provider.provider_id)
  );

  if (uniqueProviders.length === 0) return null;

  const getProviderUrl = (provider: WatchProvider): string => {
    return providerUrls[provider.provider_name] || link || "#";
  };

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <ExternalLink className="w-5 h-5" />
        Where to Watch
      </h2>
      <div className="flex flex-wrap gap-3">
        {uniqueProviders.slice(0, 8).map((provider) => {
          const url = getProviderUrl(provider);
          const isStream = providers.flatrate?.some((p) => p.provider_id === provider.provider_id);
          const isRent = providers.rent?.some((p) => p.provider_id === provider.provider_id);
          
          return (
            <a
              key={provider.provider_id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-card hover:bg-card/80 rounded-lg border border-border transition-colors group"
            >
              <MediaImage
                src={getProviderLogoUrl(provider.logo_path)}
                alt={provider.provider_name}
                className="w-8 h-8 rounded"
                fallbackSrc="/fallbacks/still.svg"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium group-hover:text-primary transition-colors">
                  {provider.provider_name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {isStream ? "Stream" : isRent ? "Rent" : "Buy"}
                </span>
              </div>
            </a>
          );
        })}
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3"
        >
          View all options <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

export default memo(WhereToWatch);
