import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import { pluralCategory } from '../../../../core/i18n/plural-category';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { formatBankTime } from '../../../donations/donation-date';
import { AdministrationVisit } from '../../device-copy/administration-visit';
import type {
  BookedPaymentsTally,
  OtherAdministrator,
  PaymentsTally,
  VisitChanges,
} from '../../device-copy/visit-changes';

interface VisitFigure {
  readonly label: string;
  readonly text: string;
  readonly link: string | null;
  readonly query: Record<string, string> | null;
}

@Component({
  selector: 'app-since-last-visit',
  imports: [RouterLink, NeedsConnection, NgTemplateOutlet],
  templateUrl: './since-last-visit.html',
  styleUrl: './since-last-visit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[hidden]': "dismissed() || state().kind === 'closed'",
    '(document:visibilitychange)': 'visibilityChanged()',
  },
})
export class SinceLastVisit {
  private readonly visit = inject(AdministrationVisit);
  private readonly connectivity = inject(Connectivity);
  private readonly document = inject(DOCUMENT);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly visible = signal(this.document.visibilityState !== 'hidden');

  protected readonly state = this.visit.state;
  protected readonly dismissed = this.visit.dismissed;
  protected readonly lead = computed(() => {
    const state = this.state();
    switch (state.kind) {
      case 'first':
        return $localize`:@@admin.home.visit.first:Na tomto zařízení zatím není s čím porovnat. Příště tu uvidíte, co mezitím přibylo: platby, dárci, potvrzení a úkony dalších správců.`;
      case 'not-kept':
        return $localize`:@@admin.home.visit.notKept:V tomto prohlížeči se správa neukládá, a tak tu není s čím porovnat, co od minula přibylo. Souhrn uvidíte na zařízení, kde se správa ukládá.`;
      case 'ready':
        return leadOf(formatBankTime(state.seenAt), state.changes);
      default:
        return '';
    }
  });
  protected readonly offlineNote = computed(() => {
    const state = this.state();
    if (state.kind !== 'ready' || state.copiedAt === null) {
      return null;
    }
    const time = formatBankTime(state.copiedAt);
    return $localize`:@@admin.home.visit.offline:Bez spojení se serverem vidíte údaje z ${time}:time:. Nemusí být aktuální.`;
  });
  protected readonly figures = computed((): readonly VisitFigure[] => {
    const state = this.state();
    return state.kind === 'ready' && state.changes.anything ? figuresOf(state.changes) : [];
  });

  constructor() {
    effect(() => {
      this.visit.opened();
      this.connectivity.offline();
      if (this.visible()) {
        untracked(() => void this.visit.check());
      }
    });
    effect(() => {
      const kind = this.state().kind;
      if (this.visible() && (kind === 'ready' || kind === 'first')) {
        untracked(() => void this.visit.keepMark().catch(() => undefined));
      }
    });
  }

  protected visibilityChanged(): void {
    this.visible.set(this.document.visibilityState !== 'hidden');
  }

  protected retry(): void {
    this.title().nativeElement.focus();
    void this.visit.check();
  }

  protected close(): void {
    this.visit.dismiss();
    this.document.querySelector<HTMLElement>('main h1')?.focus();
  }
}

const NONE = $localize`:@@admin.home.since.none:žádná`;
const NO_DONORS = $localize`:@@admin.home.visit.newDonors.none:žádní`;

function leadOf(at: string, changes: VisitChanges): string {
  if (!changes.anything) {
    return $localize`:@@admin.home.visit.nothing:Minulá návštěva na tomto zařízení byla ${at}:time:. Od té doby nepřibylo nic nového.`;
  }
  const { count } = changes.payments;
  const total = crowns(changes.payments);
  switch (count === 0 ? 'none' : pluralCategory(count)) {
    case 'none':
      return $localize`:@@admin.home.visit.lead.noPayments:Minulá návštěva na tomto zařízení byla ${at}:time:. Od té doby nepřišla žádná platba.`;
    case 'one':
      return $localize`:@@admin.home.visit.lead.one:Minulá návštěva na tomto zařízení byla ${at}:time:. Od té doby přišla 1 platba za ${total}:total:.`;
    case 'few':
      return $localize`:@@admin.home.visit.lead.few:Minulá návštěva na tomto zařízení byla ${at}:time:. Od té doby přišly ${count}:count: platby za ${total}:total:.`;
    default:
      return $localize`:@@admin.home.visit.lead.many:Minulá návštěva na tomto zařízení byla ${at}:time:. Od té doby přišlo ${count}:count: plateb za ${total}:total:.`;
  }
}

function figuresOf(changes: VisitChanges): VisitFigure[] {
  const figures: VisitFigure[] = [];
  if (changes.payments.count > 0) {
    figures.push(
      paymentFigure(
        $localize`:@@admin.home.since.paired:Přiřazené dárcům`,
        changes.paired,
        (from) => ({ stav: 'prirazene', od: from }),
      ),
      paymentFigure(
        $localize`:@@admin.home.since.unpaired:Čekají na přiřazení`,
        changes.unpaired,
        (from) => ({ od: from }),
      ),
    );
  }
  figures.push(
    {
      label: $localize`:@@admin.home.since.newDonors:Noví dárci`,
      text: changes.newDonors > 0 ? registrationsText(changes.newDonors) : NO_DONORS,
      link: changes.newDonors > 0 ? '/sprava/darci' : null,
      query: null,
    },
    {
      label: $localize`:@@admin.home.visit.receipts:Vydaná potvrzení`,
      text:
        changes.receipts > 0
          ? $localize`:@@admin.home.visit.receipts.count:${changes.receipts}:count: potvrzení`
          : NONE,
      link: null,
      query: null,
    },
    {
      label: $localize`:@@admin.home.visit.others:Úkony dalších správců`,
      text:
        changes.otherAdministrators.length > 0
          ? changes.otherAdministrators.map(administratorText).join(', ')
          : $localize`:@@admin.home.visit.others.none:žádné`,
      link: changes.otherAdministrators.length > 0 ? '/sprava/historie' : null,
      query: null,
    },
  );
  return figures;
}

function paymentFigure(
  label: string,
  tally: BookedPaymentsTally,
  query: (from: string) => Record<string, string>,
): VisitFigure {
  return tally.count === 0 || tally.bookedFrom === null
    ? { label, text: NONE, link: null, query: null }
    : { label, text: paymentsText(tally), link: '/sprava/platby', query: query(tally.bookedFrom) };
}

function crowns(tally: PaymentsTally): string {
  return `${formatMinorUnits(tally.totalMinor)}\u00a0Kč`;
}

function paymentsText(tally: PaymentsTally): string {
  const { count } = tally;
  const total = crowns(tally);
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.since.payments.one:1 platba za ${total}:total:`;
    case 'few':
      return $localize`:@@admin.home.since.payments.few:${count}:count: platby za ${total}:total:`;
    case 'other':
      return $localize`:@@admin.home.since.payments.many:${count}:count: plateb za ${total}:total:`;
  }
}

function registrationsText(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.since.registrations.one:1 nová registrace`;
    case 'few':
      return $localize`:@@admin.home.since.registrations.few:${count}:count: nové registrace`;
    case 'other':
      return $localize`:@@admin.home.since.registrations.many:${count}:count: nových registrací`;
  }
}

function administratorText(administrator: OtherAdministrator): string {
  const name = administrator.name ?? $localize`:@@admin.home.visit.others.unnamed:jiný správce`;
  const count = administrator.actions;
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.visit.others.one:${name}:name:: 1 úkon`;
    case 'few':
      return $localize`:@@admin.home.visit.others.few:${name}:name:: ${count}:count: úkony`;
    case 'other':
      return $localize`:@@admin.home.visit.others.many:${name}:name:: ${count}:count: úkonů`;
  }
}
