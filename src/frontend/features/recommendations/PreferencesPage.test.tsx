import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesPage from "./PreferencesPage";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
  updatePreferences: vi.fn(async () => ({})),
  auth: { user: { id: "u1", username: "Maya Shah" }, profile: null },
  userData: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate, useLocation: () => ({ state: null }) }));
vi.mock("@/frontend/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/frontend/hooks/useUserData", () => ({ useUserData: () => mocks.userData }));
vi.mock("@/frontend/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/frontend/components/Header", () => ({ default: () => null }));
vi.mock("./ReckonPreferences", () => ({
  PREF_LANGUAGES: [{ code: "hi", label: "Hindi" }],
  PREF_GENRES: [{ id: 35, name: "Comedy" }],
  useGenreArtwork: () => ({ data: undefined, isLoading: false }),
  LanguagePicker: ({ onToggle }: { onToggle: (code: string) => void }) => <button type="button" onClick={() => onToggle("hi")}>Hindi</button>,
  GenrePicker: ({ onToggle }: { onToggle: (id: number) => void }) => <button type="button" onClick={() => onToggle(35)}>Comedy</button>,
}));

describe("taste onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.userData = { preferences: { preferred_languages: [], preferred_genres: [] }, updatePreferences: mocks.updatePreferences };
  });

  it("greets the new viewer and needs a language and a genre before building the feed", () => {
    render(<PreferencesPage mode="onboarding" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Maya, what do you love to watch?");
    expect(screen.queryByText("Back to Reckon")).not.toBeInTheDocument();
    const build = screen.getByRole("button", { name: "Build my feed" });
    expect(build).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hindi" }));
    expect(build).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Comedy" }));
    expect(build).toBeEnabled();
  });

  it("saves the taste, completes onboarding, refreshes feeds and opens the home page", async () => {
    render(<PreferencesPage mode="onboarding" />);
    fireEvent.click(screen.getByRole("button", { name: "Hindi" }));
    fireEvent.click(screen.getByRole("button", { name: "Comedy" }));
    fireEvent.click(screen.getByRole("button", { name: "Build my feed" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/home", { replace: true, state: { preferencesUpdated: true } }));
    expect(mocks.updatePreferences).toHaveBeenCalledWith({ preferred_languages: ["hi"], preferred_genres: [35], onboarding_completed: true });
    expect(mocks.invalidateQueries).toHaveBeenCalled();
    expect(window.localStorage.getItem("mr:onboarded:u1")).toBe("1");
  });

  it("lets the viewer skip without picking anything", async () => {
    render(<PreferencesPage mode="onboarding" />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/home", { replace: true, state: { preferencesUpdated: false } }));
    expect(mocks.updatePreferences).toHaveBeenCalledWith({ onboarding_completed: true });
  });

  it("keeps the regular editor unchanged", () => {
    render(<PreferencesPage />);
    expect(screen.getByText("Back to Reckon")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
  });
});
