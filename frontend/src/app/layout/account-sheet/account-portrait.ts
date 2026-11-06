import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth-store';
import { PeopleApi } from '../../features/content/people-api';

interface LoadedPortrait {
  readonly donorId: string;
  readonly url: string | null;
}

@Injectable({ providedIn: 'root' })
export class AccountPortrait {
  private readonly auth = inject(AuthStore);
  private readonly people = inject(PeopleApi);
  private readonly loaded = signal<LoadedPortrait | null>(null);
  private askedFor: string | null = null;

  readonly url = computed(() => {
    const donor = this.auth.donor();
    const loaded = this.loaded();
    return donor !== null && this.auth.isAdmin() && loaded?.donorId === donor.id
      ? loaded.url
      : null;
  });

  ask(): void {
    const donor = this.auth.donor();
    if (donor === null || !this.auth.isAdmin() || this.askedFor === donor.id) {
      return;
    }
    const donorId = donor.id;
    this.askedFor = donorId;
    this.people.mine().subscribe({
      next: ({ member }) => {
        if (this.askedFor === donorId) {
          this.loaded.set({
            donorId,
            url: member?.portrait ? `${member.portrait.url}?w=480` : null,
          });
        }
      },
      error: () => {
        if (this.askedFor === donorId) {
          this.askedFor = null;
          this.loaded.set({ donorId, url: null });
        }
      },
    });
  }
}
