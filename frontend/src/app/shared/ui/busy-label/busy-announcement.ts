import { computed, Injectable } from '@angular/core';

@Injectable()
export class BusyAnnouncement {
  readonly text = computed(() => '');
}
