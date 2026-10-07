import manifest from "../../public/hackathon-demo/films/v2/manifest.json";

export type HackathonDemoFilm = { src: string; poster: string; seconds: number };

/** Films rendered by scripts/generate-hackathon-demo-films.ts. */
export function hackathonDemoFilm(number: 1 | 2 | 3 | 4) {
  const films: Record<string, HackathonDemoFilm | undefined> = manifest.films;
  return films[number] ?? null;
}
