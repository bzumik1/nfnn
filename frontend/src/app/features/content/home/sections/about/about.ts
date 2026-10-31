/// <reference types="@angular/localize" />

import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AboutPhotoResponse } from '../../../about-api';
import { mediaUrl } from '../../../news-api';
import { personInitials, PublicPeopleResponse } from '../../../people-api';

const PHOTO_WIDTHS = [480, 960, 1440];
const LARGEST_WIDTH = PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1];
const PORTRAIT_WIDTH = 480;
const SIGNATURE_WIDTH = 480;
const NO_BREAK_SPACE = '\u00a0';

@Component({
  selector: 'app-about',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './about.html',
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  readonly photo = input<AboutPhotoResponse | null>(null);
  readonly people = input<PublicPeopleResponse | null>(null);

  protected readonly boardLine = computed(() => {
    const board = this.people()?.board ?? [];
    if (board.length === 0) {
      return null;
    }
    const members = board
      .map((member) => {
        const name = member.name.split(/\s+/).join(NO_BREAK_SPACE);
        return member.note ? `${name} (${member.note})` : name;
      })
      .join(', ');
    return `${$localize`:@@home.about.board.members.label:Správní rada:`} ${members}.`;
  });

  protected readonly photoSource = computed(() => {
    const photo = this.photo();
    return photo ? mediaUrl(photo.id, PHOTO_WIDTHS[0]) : null;
  });

  protected readonly photoSet = computed(() => {
    const photo = this.photo();
    if (!photo) {
      return null;
    }
    const largest = Math.min(photo.width, LARGEST_WIDTH);
    return [
      ...PHOTO_WIDTHS.filter((width) => width < largest).map(
        (width) => `${mediaUrl(photo.id, width)} ${width}w`,
      ),
      `${mediaUrl(photo.id, LARGEST_WIDTH)} ${largest}w`,
    ].join(', ');
  });

  protected portraitSource(imageId: string): string {
    return mediaUrl(imageId, PORTRAIT_WIDTH);
  }

  protected signatureSource(url: string): string {
    return `${url}?w=${SIGNATURE_WIDTH}`;
  }

  protected paragraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph !== '');
  }

  protected readonly initials = personInitials;
}
