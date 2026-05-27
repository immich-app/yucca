import { DEFAULT_PAGE_SIZE } from 'src/dto/pagination.dto';

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function resolveLimit(limit?: string): number {
  return limit ? Number.parseInt(limit) : DEFAULT_PAGE_SIZE;
}

export function toCursorPage<T extends { id: string }>(rows: T[], limit: number): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}
