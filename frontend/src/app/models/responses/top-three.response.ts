export type TopThreeCategory = 'movies' | 'shows' | 'songs' | 'albums' | 'artists';

// Uniform shape across every category (movies/shows use title+cover only;
// songs/albums additionally use subtitle for the artist name; artists use
// title for their name and cover for their picture) so the podium card and
// manage page can render any category with one template instead of five.
export interface TopThreeItem {
  id: string;
  title: string;
  subtitle?: string;
  cover: string;
}

export interface TopThreeCategoryState {
  manualOverride: boolean;
  items: TopThreeItem[];
}

export interface TopThreeResponse {
  isPublic: boolean;
  movies: TopThreeCategoryState;
  shows: TopThreeCategoryState;
  songs: TopThreeCategoryState;
  albums: TopThreeCategoryState;
  artists: TopThreeCategoryState;
}
