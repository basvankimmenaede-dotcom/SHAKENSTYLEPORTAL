export type TvDetailItem = {
  key: string;
  projectId: number;
  periodIndex: number;
  kind: 'start' | 'end' | 'ongoing';
  namePart: string;
  namePartIndex: number;
  namePartCount: number;
};

export type TvDetailPage = {
  day: string;
  items: TvDetailItem[];
  pageIndex: number;
  pageCount: number;
  projectCount: number;
};

export type TvCursor = {
  day: string;
  anchorKey: string | null;
  pageIndex: number;
};

const MAX_ITEMS_PER_PAGE = 3;
const ESTIMATED_ITEM_HEIGHT = 220;

/**
 * The first supplied day is today. Dates and items retain their supplied order.
 * A card taller than the available space still gets its own page: splitting
 * oversized content belongs to the card renderer, never to the project count.
 */
export function paginateTvDays(
  days: { date: string; projectIds: number[] }[],
  itemsByDay: Record<string, TvDetailItem[]>,
  heights: Record<string, number>,
  availableHeight: number,
  gap: number,
): TvDetailPage[] {
  const pages: TvDetailPage[] = [];
  const heightLimit = Number.isFinite(availableHeight)
    ? Math.max(0, availableHeight)
    : 0;
  const itemGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;

  days.forEach((day, dayIndex) => {
    const items = itemsByDay[day.date] ?? [];
    const projectCount = new Set(day.projectIds).size;

    if (items.length === 0) {
      if (dayIndex === 0) {
        pages.push({
          day: day.date,
          items: [],
          pageIndex: 0,
          pageCount: 1,
          projectCount,
        });
      }
      return;
    }

    const chunks: TvDetailItem[][] = [];
    let chunk: TvDetailItem[] = [];
    let chunkHeight = 0;

    for (const item of items) {
      const measuredHeight = heights[item.key];
      const height = Number.isFinite(measuredHeight) && measuredHeight > 0
        ? measuredHeight
        : ESTIMATED_ITEM_HEIGHT;
      const nextHeight = chunkHeight + (chunk.length > 0 ? itemGap : 0) + height;

      if (chunk.length > 0 && (
        chunk.length >= MAX_ITEMS_PER_PAGE || nextHeight > heightLimit
        || (chunk[0].kind === 'ongoing') !== (item.kind === 'ongoing')
      )) {
        chunks.push(chunk);
        chunk = [];
        chunkHeight = 0;
      }

      chunkHeight += (chunk.length > 0 ? itemGap : 0) + height;
      chunk.push(item);
    }

    if (chunk.length > 0) chunks.push(chunk);

    chunks.forEach((itemsOnPage, pageIndex) => {
      pages.push({
        day: day.date,
        items: itemsOnPage,
        pageIndex,
        pageCount: chunks.length,
        projectCount,
      });
    });
  });

  return pages;
}

export function cursorForPage(page: TvDetailPage): TvCursor {
  return {
    day: page.day,
    anchorKey: page.items[0]?.key ?? null,
    pageIndex: page.pageIndex,
  };
}

/**
 * Return a global page index, preserving the visible item across a refresh or
 * resize. With no remaining anchor, retain the nearest page of the same day.
 * With no remaining day, continue to the next ISO date, wrapping at the end.
 * Returns -1 only when there are no pages.
 */
export function reconcileTvCursor(
  pages: TvDetailPage[],
  cursor: TvCursor | null | undefined,
): number {
  if (pages.length === 0) return -1;
  if (!cursor) return 0;

  const dayPageIndices: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page.day !== cursor.day) continue;

    dayPageIndices.push(index);
    if (cursor.anchorKey !== null && page.items.some(item => item.key === cursor.anchorKey)) {
      return index;
    }
  }

  if (dayPageIndices.length > 0) {
    const requestedPage = Number.isFinite(cursor.pageIndex)
      ? Math.max(0, Math.trunc(cursor.pageIndex))
      : 0;
    let nearestIndex = dayPageIndices[0];

    for (const index of dayPageIndices.slice(1)) {
      if (Math.abs(pages[index].pageIndex - requestedPage)
        < Math.abs(pages[nearestIndex].pageIndex - requestedPage)) {
        nearestIndex = index;
      }
    }

    return nearestIndex;
  }

  const nextDayIndex = pages.findIndex(page => page.day > cursor.day);
  return nextDayIndex === -1 ? 0 : nextDayIndex;
}
