/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { MAX_IMAGE_BYTES, mediaUrl, NewsApi, UploadedImageResponse } from '../../content/news-api';
import { AdminApi, MAX_RECEIPT_ROLE_LENGTH, ReceiptSignatoryResponse } from '../admin-api';
import { ReceiptSignature } from '../receipt-signature/receipt-signature';
import {
  EMAIL_SHAPE,
  MAX_BOARD_NOTE_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_FOUNDERS_NOTE_LENGTH,
  MAX_PEOPLE_FOOTNOTE_LENGTH,
  MAX_PEOPLE,
  MAX_PERSON_NAME_LENGTH,
  MAX_PERSON_ROLE_LENGTH,
  PeopleApi,
  PersonImageResponse,
  PersonRequest,
  PersonResponse,
} from '../../content/people-api';
import { Avatar } from '../../../shared/ui/avatar/avatar';

type LoadState = 'loading' | 'ready' | 'error';
type Direction = 'up' | 'down';

interface ReceiptDraft {
  signs: boolean;
  role: string;
}

interface Draft {
  name: string;
  role: string;
  onBoard: boolean;
  boardNote: string;
  featured: boolean;
  personalEmail: string;
  fundEmail: string;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const PREVIEW_WIDTH = 480;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const NEW_PERSON = 'new';

@Component({
  selector: 'app-admin-people',
  imports: [
    Avatar,
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    FileButton,
    LiveNotice,
    ReceiptSignature,
  ],
  templateUrl: './admin-people.html',
  styleUrl: './admin-people.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPeople {
  private readonly api = inject(PeopleApi);
  private readonly admin = inject(AdminApi);
  private readonly media = inject(NewsApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly personForm = viewChild<NgForm>('personForm');
  private readonly receiptTitle = viewChild<ElementRef<HTMLHeadingElement>>('receiptTitle');

  protected readonly maxNameLength = MAX_PERSON_NAME_LENGTH;
  protected readonly maxRoleLength = MAX_PERSON_ROLE_LENGTH;
  protected readonly maxBoardNoteLength = MAX_BOARD_NOTE_LENGTH;
  protected readonly maxNoteLength = MAX_FOUNDERS_NOTE_LENGTH;
  protected readonly maxFootnoteLength = MAX_PEOPLE_FOOTNOTE_LENGTH;
  protected readonly maxEmailLength = MAX_EMAIL_LENGTH;
  protected readonly maxReceiptRoleLength = MAX_RECEIPT_ROLE_LENGTH;
  protected readonly emailShape = EMAIL_SHAPE;

  protected readonly state = signal<LoadState>('loading');
  protected readonly members = signal<PersonResponse[]>([]);
  protected readonly editing = signal<string | null>(null);
  protected readonly portrait = signal<PersonImageResponse | null>(null);
  protected readonly uploadingPortrait = signal(false);
  protected readonly portraitError = signal<string | null>(null);
  protected readonly uploadingSignature = signal(false);
  protected readonly signatureNotice = signal<Notice | null>(null);
  protected readonly saving = signal(false);
  protected readonly moving = signal(false);
  protected readonly confirmingRemoval = signal(false);
  protected readonly removing = signal(false);
  protected readonly savingNote = signal(false);
  protected readonly savingFootnote = signal(false);
  protected readonly listNotice = signal<Notice | null>(null);
  protected readonly editorNotice = signal<Notice | null>(null);
  protected readonly noteNotice = signal<Notice | null>(null);
  protected readonly signatory = signal<ReceiptSignatoryResponse | null>(null);
  protected readonly signatoryState = signal<LoadState>('loading');
  protected readonly signatureBusy = signal(false);
  protected readonly savingReceipt = signal(false);
  protected readonly receiptNotice = signal<Notice | null>(null);
  protected readonly footnoteNotice = signal<Notice | null>(null);

  protected draft: Draft = emptyDraft();
  protected receiptDraft: ReceiptDraft = { signs: false, role: '' };
  protected noteText = '';
  protected footnoteText = '';

  protected readonly nameMessages = {
    required: $localize`:@@admin.people.name.required:Vyplňte prosím jméno.`,
    maxlength: $localize`:@@admin.people.name.tooLong:Jméno může mít nejvíc ${MAX_PERSON_NAME_LENGTH}:max: znaků.`,
  };
  protected readonly roleMessages = {
    maxlength: $localize`:@@admin.people.role.tooLong:Role může mít nejvíc ${MAX_PERSON_ROLE_LENGTH}:max: znaků.`,
  };
  protected readonly boardNoteMessages = {
    maxlength: $localize`:@@admin.people.boardNote.tooLong:Poznámka může mít nejvíc ${MAX_BOARD_NOTE_LENGTH}:max: znaků.`,
  };
  protected readonly emailMessages = {
    pattern: $localize`:@@admin.people.email.invalid:Zadejte e-mail ve tvaru jana@example.cz.`,
    maxlength: $localize`:@@admin.people.email.tooLong:E-mail může mít nejvíc ${MAX_EMAIL_LENGTH}:max: znaků.`,
  };
  protected readonly receiptRoleMessages = {
    required: $localize`:@@admin.people.receiptRole.required:Vyplňte prosím funkci, která se vytiskne pod jméno.`,
    maxlength: $localize`:@@admin.people.receiptRole.tooLong:Funkce může mít nejvíc ${MAX_RECEIPT_ROLE_LENGTH}:max: znaků.`,
  };
  protected readonly noteMessages = {
    maxlength: $localize`:@@admin.people.note.tooLong:Slovo zakladatelů může mít nejvíc ${MAX_FOUNDERS_NOTE_LENGTH}:max: znaků.`,
  };
  protected readonly footnoteMessages = {
    maxlength: $localize`:@@admin.people.footnote.tooLong:Řádek může mít nejvíc ${MAX_PEOPLE_FOOTNOTE_LENGTH}:max: znaků.`,
  };

  protected readonly current = computed(() => {
    const id = this.editing();
    return this.members().find((member) => member.id === id) ?? null;
  });
  protected readonly adding = computed(() => this.editing() === NEW_PERSON);
  protected readonly full = computed(() => this.members().length >= MAX_PEOPLE);
  protected readonly portraitUrl = computed(() => {
    const image = this.portrait();
    return image ? mediaUrl(image.id, PREVIEW_WIDTH) : null;
  });
  protected readonly signatureUrl = computed(() => {
    const signature = this.current()?.webSignature;
    return signature ? mediaUrl(signature.id, PREVIEW_WIDTH) : null;
  });
  protected readonly signatoryName = computed(() => this.signatory()?.signatory?.name ?? null);
  protected readonly busy = computed(
    () =>
      this.saving() ||
      this.savingReceipt() ||
      this.removing() ||
      this.uploadingPortrait() ||
      this.uploadingSignature() ||
      this.signatureBusy() ||
      this.moving(),
  );

  constructor() {
    this.load();
    this.loadSignatory();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (people) => {
          this.members.set(people.members);
          this.noteText = people.note ?? '';
          this.footnoteText = people.footnote ?? '';
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sendToSignIn();
            return;
          }
          if (problemTypeEndsWith(failure, FORBIDDEN)) {
            this.router.navigateByUrl('/darce/prehled');
            return;
          }
          this.state.set('error');
        },
      });
  }

  protected signs(member: PersonResponse): boolean {
    return this.signatory()?.signatory?.personId === member.id;
  }

  protected retrySignatory(): void {
    this.receiptTitle()?.nativeElement.focus();
    this.loadSignatory();
  }

  protected loadSignatory(): void {
    if (this.signatoryState() !== 'ready') {
      this.signatoryState.set('loading');
    }
    this.admin
      .receiptSignatory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.signatory.set(view);
          this.signatoryState.set('ready');
          this.fillReceiptRole();
        },
        error: () => {
          if (this.signatoryState() !== 'ready') {
            this.signatoryState.set('error');
          }
        },
      });
  }

  private fillReceiptRole(): void {
    const member = this.current();
    if (member !== null && this.signs(member) && this.receiptDraft.role === '') {
      this.receiptDraft = { signs: false, role: this.signatory()?.signatory?.receiptRole ?? '' };
    }
  }

  protected saveReceipt(form: NgForm): void {
    const person = this.current();
    if (person === null || this.busy()) {
      return;
    }
    this.receiptNotice.set(null);
    if (form.invalid) {
      return;
    }
    this.savingReceipt.set(true);
    this.admin
      .chooseReceiptSignatory({ personId: person.id, receiptRole: this.receiptDraft.role.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chosen) => {
          this.savingReceipt.set(false);
          this.signatory.update((view) => ({
            signatory: chosen,
            signatures: view?.signatures ?? [],
          }));
          this.receiptDraft = { signs: false, role: chosen.receiptRole };
          this.receiptNotice.set({
            kind: 'status',
            text: $localize`:@@admin.people.receipt.saved:Potvrzení vystavená od teď podepisuje ${chosen.name}:name: s funkcí ${chosen.receiptRole}:role:.`,
          });
        },
        error: (failure: unknown) => {
          this.savingReceipt.set(false);
          this.receiptNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.people.receipt.failed:Podepisujícího se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected startAdding(): void {
    this.open(NEW_PERSON, null);
  }

  protected edit(member: PersonResponse): void {
    if (this.busy()) {
      return;
    }
    this.open(member.id, member);
  }

  protected cancelEditing(): void {
    const id = this.editing();
    this.editing.set(null);
    this.focusLater(id && id !== NEW_PERSON ? `#person-edit-${id}` : '#people-add');
  }

  protected move(member: PersonResponse, direction: Direction): void {
    const order = this.members().map((item) => item.id);
    const from = order.indexOf(member.id);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (this.busy() || to < 0 || to >= order.length) {
      return;
    }
    [order[from], order[to]] = [order[to], order[from]];
    this.listNotice.set(null);
    this.moving.set(true);
    this.api
      .order(order)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (people) => {
          this.moving.set(false);
          this.members.set(people.members);
          this.listNotice.set({
            kind: 'status',
            text: $localize`:@@admin.people.moved:Pořadí je uložené, web ho ukazuje hned.`,
          });
          const last = people.members.length - 1;
          const stillPossible = direction === 'up' ? to > 0 : to < last;
          this.focusLater(
            `#person-${stillPossible ? direction : direction === 'up' ? 'down' : 'up'}-${member.id}`,
          );
        },
        error: (failure: unknown) => {
          this.moving.set(false);
          this.listNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.people.move.failed:Pořadí se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected uploadPortrait(file: File): void {
    this.portraitError.set(null);
    this.editorNotice.set(null);
    const refusal = refusalOf(file);
    if (refusal) {
      this.portraitError.set(refusal);
      return;
    }
    this.uploadingPortrait.set(true);
    this.upload(file).subscribe({
      next: (uploaded) => {
        this.uploadingPortrait.set(false);
        this.portrait.set(imageOf(uploaded));
      },
      error: (failure: unknown) => {
        this.uploadingPortrait.set(false);
        this.portraitError.set(
          describeProblem(
            failure,
            $localize`:@@admin.people.portrait.failed:Portrét se nepodařilo nahrát. Zkuste to prosím znovu.`,
          ),
        );
      },
    });
  }

  protected dropPortrait(): void {
    this.portrait.set(null);
    this.focusLater('#person-portrait');
  }

  protected save(form: NgForm): void {
    const id = this.editing();
    if (this.busy() || id === null) {
      return;
    }
    this.editorNotice.set(null);
    if (form.invalid) {
      return;
    }
    const request = this.request();
    this.saving.set(true);
    const call = id === NEW_PERSON ? this.api.add(request) : this.api.update(id, request);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.members.update((members) =>
          id === NEW_PERSON
            ? [...members, saved]
            : members.map((member) => (member.id === saved.id ? saved : member)),
        );
        this.editing.set(null);
        this.listNotice.set({
          kind: 'status',
          text:
            id === NEW_PERSON
              ? $localize`:@@admin.people.added:Přidali jsme mezi lidi fondu: ${saved.name}:name:. Web ukazuje změnu hned.`
              : $localize`:@@admin.people.saved:Změny u ${saved.name}:name: jsou uložené a na webu.`,
        });
        this.focusLater(`#person-edit-${saved.id}`);
      },
      error: (failure: unknown) => {
        this.saving.set(false);
        this.editorNotice.set({
          kind: 'alert',
          text: describeProblem(
            failure,
            $localize`:@@admin.people.save.failed:Osobu se nepodařilo uložit. Zkuste to prosím znovu.`,
          ),
        });
      },
    });
  }

  protected uploadSignature(file: File): void {
    const person = this.current();
    if (person === null || this.busy()) {
      return;
    }
    this.signatureNotice.set(null);
    const refusal = refusalOf(file);
    if (refusal) {
      this.signatureNotice.set({ kind: 'alert', text: refusal });
      return;
    }
    this.uploadingSignature.set(true);
    this.upload(file).subscribe({
      next: (uploaded) =>
        this.applySignature(
          this.api.setWebSignature(person.id, uploaded.id),
          $localize`:@@admin.people.signature.saved:Podpis je uložený a ukáže se pod slovem zakladatelů.`,
        ),
      error: (failure: unknown) => {
        this.uploadingSignature.set(false);
        this.signatureNotice.set({
          kind: 'alert',
          text: describeProblem(
            failure,
            $localize`:@@admin.people.signature.failed:Podpis se nepodařilo nahrát. Zkuste to prosím znovu.`,
          ),
        });
      },
    });
  }

  protected removeSignature(): void {
    const person = this.current();
    if (person === null || this.busy()) {
      return;
    }
    this.signatureNotice.set(null);
    this.uploadingSignature.set(true);
    this.applySignature(
      this.api.removeWebSignature(person.id),
      $localize`:@@admin.people.signature.removed:Podpis jsme z webu odebrali a smazali.`,
    );
  }

  protected askRemoval(): void {
    if (this.signatoryState() !== 'ready') {
      return;
    }
    this.editorNotice.set(null);
    this.confirmingRemoval.set(true);
    this.focusLater('#person-remove-cancel');
  }

  protected cancelRemoval(): void {
    this.confirmingRemoval.set(false);
    this.focusLater('#person-remove');
  }

  protected remove(): void {
    const person = this.current();
    if (person === null || this.busy()) {
      return;
    }
    this.removing.set(true);
    this.api
      .remove(person.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removing.set(false);
          this.confirmingRemoval.set(false);
          this.editing.set(null);
          this.members.update((members) => members.filter((member) => member.id !== person.id));
          this.listNotice.set({
            kind: 'status',
            text: $localize`:@@admin.people.removed:${person.name}:name: už mezi lidmi fondu není; portrét a podpis jsme smazali.`,
          });
          this.focusLater('#people-add');
        },
        error: (failure: unknown) => {
          this.removing.set(false);
          this.confirmingRemoval.set(false);
          this.editorNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.people.remove.failed:Osobu se nepodařilo odebrat. Zkuste to prosím znovu.`,
            ),
          });
          this.focusLater('#person-remove');
        },
      });
  }

  protected saveNote(form: NgForm): void {
    if (this.savingNote()) {
      return;
    }
    this.noteNotice.set(null);
    if (form.invalid) {
      return;
    }
    this.savingNote.set(true);
    this.api
      .saveNote(text(this.noteText))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (note) => {
          this.savingNote.set(false);
          this.noteText = note.text ?? '';
          form.form.markAsPristine();
          this.noteNotice.set({
            kind: 'status',
            text: note.text
              ? $localize`:@@admin.people.note.saved:Slovo zakladatelů je uložené a na webu.`
              : $localize`:@@admin.people.note.removed:Slovo zakladatelů jsme z webu odebrali.`,
          });
        },
        error: (failure: unknown) => {
          this.savingNote.set(false);
          this.noteNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.people.note.failed:Slovo zakladatelů se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected saveFootnote(form: NgForm): void {
    if (this.savingFootnote()) {
      return;
    }
    this.footnoteNotice.set(null);
    if (form.invalid) {
      return;
    }
    this.savingFootnote.set(true);
    this.api
      .saveFootnote(text(this.footnoteText))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (footnote) => {
          this.savingFootnote.set(false);
          this.footnoteText = footnote.text ?? '';
          form.form.markAsPristine();
          this.footnoteNotice.set({
            kind: 'status',
            text: footnote.text
              ? $localize`:@@admin.people.footnote.saved:Řádek pod správní radou je uložený a na webu.`
              : $localize`:@@admin.people.footnote.removed:Řádek pod správní radou jsme z webu odebrali.`,
          });
        },
        error: (failure: unknown) => {
          this.savingFootnote.set(false);
          this.footnoteNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.people.footnote.failed:Řádek pod správní radou se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected moveUpLabel(member: PersonResponse): string {
    return $localize`:@@admin.people.move.up.label:Výš: ${member.name}:name:`;
  }

  protected moveDownLabel(member: PersonResponse): string {
    return $localize`:@@admin.people.move.down.label:Níž: ${member.name}:name:`;
  }

  protected editLabel(member: PersonResponse): string {
    return $localize`:@@admin.people.edit.label:Upravit: ${member.name}:name:`;
  }

  protected boardLabel(member: PersonResponse): string {
    return member.boardNote
      ? $localize`:@@admin.people.badge.boardWithNote:Ve správní radě (${member.boardNote}:note:)`
      : $localize`:@@admin.people.badge.board:Ve správní radě`;
  }

  private open(id: string, member: PersonResponse | null): void {
    this.listNotice.set(null);
    this.editorNotice.set(null);
    this.signatureNotice.set(null);
    this.receiptNotice.set(null);
    this.portraitError.set(null);
    this.confirmingRemoval.set(false);
    this.receiptDraft = {
      signs: false,
      role: member && this.signs(member) ? (this.signatory()?.signatory?.receiptRole ?? '') : '',
    };
    this.draft = member
      ? {
          name: member.name,
          role: member.role ?? '',
          onBoard: member.onBoard,
          boardNote: member.boardNote ?? '',
          featured: member.featured,
          personalEmail: member.personalEmail ?? '',
          fundEmail: member.fundEmail ?? '',
        }
      : emptyDraft();
    this.portrait.set(member?.portrait ?? null);
    this.editing.set(id);
    this.personForm()?.resetForm(this.draft);
    this.focusLater('#person-name');
  }

  private request(): PersonRequest {
    return {
      name: this.draft.name.trim(),
      role: text(this.draft.role),
      onBoard: this.draft.onBoard,
      boardNote: text(this.draft.boardNote),
      featured: this.draft.featured,
      portraitId: this.portrait()?.id ?? null,
      personalEmail: text(this.draft.personalEmail),
      fundEmail: text(this.draft.fundEmail),
    };
  }

  private applySignature(call: Observable<PersonResponse>, done: string): void {
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.uploadingSignature.set(false);
        this.members.update((members) =>
          members.map((member) => (member.id === saved.id ? saved : member)),
        );
        this.signatureNotice.set({ kind: 'status', text: done });
      },
      error: (failure: unknown) => {
        this.uploadingSignature.set(false);
        this.signatureNotice.set({
          kind: 'alert',
          text: describeProblem(
            failure,
            $localize`:@@admin.people.signature.saveFailed:Podpis se nepodařilo uložit. Zkuste to prosím znovu.`,
          ),
        });
      },
    });
  }

  private upload(file: File): Observable<UploadedImageResponse> {
    return this.media.uploadImage(file).pipe(takeUntilDestroyed(this.destroyRef));
  }

  private focusLater(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function emptyDraft(): Draft {
  return {
    name: '',
    role: '',
    onBoard: false,
    boardNote: '',
    featured: false,
    personalEmail: '',
    fundEmail: '',
  };
}

function imageOf(uploaded: UploadedImageResponse): PersonImageResponse {
  return { id: uploaded.id, url: uploaded.url, width: uploaded.width, height: uploaded.height };
}

function refusalOf(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return $localize`:@@admin.people.image.wrongType:Vyberte prosím obrázek ve formátu PNG, JPEG nebo WebP.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return $localize`:@@admin.people.image.tooLarge:Obrázek je větší než 10 MB. Zmenšete ho prosím a zkuste to znovu.`;
  }
  return null;
}

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
