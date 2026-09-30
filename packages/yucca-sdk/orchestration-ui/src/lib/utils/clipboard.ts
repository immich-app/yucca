import { toastManager } from '@immich/ui';
import { gt } from 'svelte-i18n-lingui';

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toastManager.success(gt`Copied to clipboard`);
  } catch {
    toastManager.danger(gt`Unable to copy to clipboard`);
  }
}
