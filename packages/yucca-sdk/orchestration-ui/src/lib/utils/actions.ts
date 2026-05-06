import type { ActionItem } from '@immich/ui';

export function hasActions(actions: ActionItem[]) {
  return actions.some((action) => !action.$if || action.$if?.());
}
