import "server-only";
import type { ContentWatchSources, FetchContentSourcesResult, SourceMediaType, SourceSearchEvent } from "@/shared/types/watchSources";
import { getCatalogConfigs, getImporterConfig } from "./config";
import { fetchContentSources } from "./contentImport";

/** Catalog failures are isolated; only persisted, identity-matched pages are emitted. */
export async function searchContentSources(
  id: number, type: SourceMediaType, config = getImporterConfig(),
  onEvent: (event: SourceSearchEvent) => void = () => {},
): Promise<FetchContentSourcesResult> {
  const sources = new Map<string, ContentWatchSources["sources"][number]>();
  const content = (): ContentWatchSources => ({ contentId: id, contentType: type, sources: [...sources.values()] });
  const emit = (event: SourceSearchEvent) => {
    if (event.type === "content") {
      event.content.sources.forEach((source) => {
        const previous = sources.get(source.sourcePage);
        if (!previous || Date.parse(source.checkedAt || "") >= Date.parse(previous.checkedAt || "") || !previous.checkedAt) {
          sources.set(source.sourcePage, source);
        }
      });
      onEvent({ type: "content", content: content() });
    } else onEvent(event);
  };
  const results = await Promise.allSettled(getCatalogConfigs(config).map(async (catalog) => {
    const result = await fetchContentSources(id, type, undefined, catalog, undefined, emit);
    emit({ type: "content", content: result.content });
    return result;
  }));
  let importedPages = 0, errors = 0, busy = false;
  for (const result of results) {
    if (result.status === "rejected") { errors++; continue; }
    importedPages += result.value.importedPages;
    errors += result.value.errors;
    busy ||= result.value.status === "busy";
  }
  return { content: content(), importedPages, errors,
    status: errors ? "partial" : busy ? "busy" : importedPages ? "imported" : "not_found" };
}
