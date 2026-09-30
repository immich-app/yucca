import { tick } from 'svelte';

export class FocusGroup {
  constructor(private readonly id: string) {}

  attributes(key?: string) {
    return { 'data-focus-group': this.id, 'data-focus-key': key };
  }

  async focusAt(index: number, fallback?: FocusGroup, fallbackKey?: string) {
    await tick();
    const members = this.members();
    const target =
      members[index] ??
      members.at(-1) ??
      (fallbackKey ? fallback?.member(fallbackKey) : fallback?.members()[0]);
    target?.focus();
  }

  async focusKey(key: string, fallback?: FocusGroup) {
    await tick();
    const member = this.member(key);
    const target = member?.matches(':disabled')
      ? fallback?.member(key)
      : member;
    target?.focus();
  }

  private members() {
    return [
      ...document.querySelectorAll<HTMLElement>(
        `[data-focus-group="${this.id}"]`,
      ),
    ];
  }

  private member(key: string) {
    return this.members().find((member) => member.dataset.focusKey === key);
  }
}
