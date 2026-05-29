import { DEFAULT_PAGE_SIZE } from 'src/dto/pagination.dto';

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function resolveLimit(limit?: string): number {
  return limit ? Number.parseInt(limit) : DEFAULT_PAGE_SIZE;
}

export function toCursorPage<T>(rows: T[], limit: number, getCursor: (row: T) => string): CursorPage<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  } else {
    const items = rows.slice(0, limit);
    return { items, nextCursor: getCursor(items.at(-1)!) };
  }
}
