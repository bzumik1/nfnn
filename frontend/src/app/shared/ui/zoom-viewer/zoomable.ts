import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { ZoomContent } from './zoom-content';
import { ZoomViewer } from './zoom-viewer';

@Component({
  selector: 'app-zoomable',
  imports: [ZoomViewer],
  templateUrl: './zoomable.html',
  styleUrl: './zoomable.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Zoomable {
  readonly content = input.required<ZoomContent>();

  protected readonly open = signal(false);
  protected readonly label = computed(() => {
    const content = this.content();
    if (content.kind === 'qr') {
      return $localize`:@@ui.zoomable.qr:Zvětšit: ${content.label}:label:`;
    }
    return content.alt
      ? $localize`:@@ui.zoomable.photoNamed:Zvětšit fotku: ${content.alt}:description:`
      : $localize`:@@ui.zoomable.photo:Zvětšit fotku`;
  });
}
