export interface HallDjGenreOption {
  id: string;
  label: string;
}

/** Spotify recommendation seed genres (subset — see Spotify API docs). */
export const HALL_DJ_GENRES: HallDjGenreOption[] = [
  { id: "pop", label: "Pop" },
  { id: "country", label: "Country" },
  { id: "rock", label: "Rock" },
  { id: "hip-hop", label: "Hip-Hop" },
  { id: "r-n-b", label: "R&B" },
  { id: "electronic", label: "Électro" },
  { id: "indie", label: "Indie" },
  { id: "jazz", label: "Jazz" },
  { id: "classical", label: "Classique" },
  { id: "latin", label: "Latin" },
  { id: "metal", label: "Metal" },
  { id: "blues", label: "Blues" },
  { id: "folk", label: "Folk" },
  { id: "soul", label: "Soul" },
  { id: "reggae", label: "Reggae" },
];

export const DEFAULT_HALL_DJ_GENRE = "pop";

export function normalizeHallDjGenre(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (HALL_DJ_GENRES.some((genre) => genre.id === raw)) return raw;
  return DEFAULT_HALL_DJ_GENRE;
}

export function hallDjGenreLabel(genreId: string): string {
  return HALL_DJ_GENRES.find((genre) => genre.id === genreId)?.label ?? "Pop";
}
