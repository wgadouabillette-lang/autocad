export type MainPageId = "settings";

export const MAIN_PAGE_LABEL: Record<MainPageId, string> = {
  settings: "Settings",
};

export function isClosablePage(_id: MainPageId): boolean {
  return true;
}

export function sortOpenPages(pages: MainPageId[]): MainPageId[] {
  return pages.includes("settings") ? ["settings"] : [];
}
