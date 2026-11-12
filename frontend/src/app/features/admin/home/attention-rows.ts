/// <reference types="@angular/localize" />

import { pluralCategory } from '../../../core/i18n/plural-category';
import { formatMinorUnits } from '../../donations/donation-amount';
import { AdminBackupsResponse, ImportStateResponse } from '../admin-api';
import { BACKUP_PROBLEM_ACTIONS, BACKUP_PROBLEM_SUMMARIES } from '../backups/backup-texts';
import { needsTechnician, technicianMessage } from '../backups/backup-message';
import { unpublishedKeysSentence } from '../settings/receipt-signing-key/unpublished-keys';
import {
  IMPORT_FAILURE_LABELS,
  IMPORT_NEXT_STEPS,
  ImportNextStepLink,
} from '../import-failure-labels';

export type LoadState = 'loading' | 'ready' | 'error';
export type SignatoryState = 'loading' | 'ok' | 'missing' | 'unsigned' | 'error';
export type AttentionTone = 'danger' | 'warning' | 'task' | 'unknown' | 'action';
export type AttentionIcon = 'payments' | 'bank' | 'backup' | 'key' | 'administrators' | 'signature';
export type AttentionRetry = 'unpaired' | 'signingKeys' | 'administrators' | 'signatory';

export interface UnpairedSummary {
  readonly count: number;
  readonly totalMinor: number;
}

export interface AttentionLink {
  readonly path: string;
  readonly fragment: string | undefined;
}

export interface AttentionRow {
  readonly key: string;
  readonly hook: string;
  readonly tone: AttentionTone;
  readonly icon: AttentionIcon | null;
  readonly title: string;
  readonly meta: string | null;
  readonly value: string | null;
  readonly step: string | null;
  readonly link: AttentionLink | null;
  readonly alert: boolean;
  readonly retry: AttentionRetry | null;
  readonly copy: string | null;
}

export interface AttentionSources {
  readonly importLoad: LoadState;
  readonly importState: ImportStateResponse | null;
  readonly unpairedLoad: LoadState;
  readonly unpaired: UnpairedSummary | null;
  readonly backupsLoad: LoadState;
  readonly backups: AdminBackupsResponse | null;
  readonly administratorsLoad: LoadState;
  readonly withoutSecondFactor: readonly string[];
  readonly signingKeysLoad: LoadState;
  readonly unpublishedSigningKeys: readonly string[];
  readonly signingKeyWarnings: readonly string[];
  readonly signatory: SignatoryState;
}

const NEXT_STEP_LINKS: Record<
  Exclude<ImportNextStepLink, null>,
  { path: string; fragment: string | undefined; label: string }
> = {
  settings: {
    path: '/sprava/nastaveni',
    fragment: undefined,
    label: $localize`:@@admin.home.import.next.settings:Otevřít Nastavení`,
  },
  logs: {
    path: '/sprava/logy',
    fragment: undefined,
    label: $localize`:@@admin.home.import.next.logs:Otevřít logy`,
  },
  history: {
    path: '/sprava',
    fragment: 'starsi-platby',
    label: $localize`:@@admin.home.import.next.history:Přejít ke starším platbám`,
  },
};

const NEXT_STEP_LABEL = $localize`:@@admin.home.import.next.label:Co udělat:`;
const SIGNING_KEY_SETTINGS: AttentionLink = {
  path: '/sprava/nastaveni',
  fragment: 'klic-k-overovacim-qr',
};
const PEOPLE: AttentionLink = { path: '/sprava/lide-fondu', fragment: undefined };
const BACKUPS: AttentionLink = { path: '/sprava/zalohy', fragment: undefined };

const ROW: Omit<AttentionRow, 'key' | 'hook' | 'tone' | 'title'> = {
  icon: null,
  meta: null,
  value: null,
  step: null,
  link: null,
  alert: false,
  retry: null,
  copy: null,
};

function row(
  fields: Pick<AttentionRow, 'key' | 'tone' | 'title'> & Partial<AttentionRow>,
): AttentionRow {
  return { ...ROW, hook: `attention-${fields.key}`, ...fields };
}

function failed(
  key: string,
  icon: AttentionIcon,
  title: string,
  retry: AttentionRetry | null,
): AttentionRow {
  return row({ key, tone: 'unknown', icon, title, alert: retry !== null, retry });
}

export function attentionRows(sources: AttentionSources): readonly AttentionRow[] {
  return [
    ...signatoryMissingRows(sources),
    ...importRows(sources),
    ...unpairedRows(sources),
    ...backupRows(sources),
    ...backupKeyRows(sources),
    ...signingKeyRows(sources),
    ...administratorRows(sources),
    ...signatoryRows(sources),
  ];
}

function signatoryMissingRows({ signatory }: AttentionSources): AttentionRow[] {
  return signatory === 'missing'
    ? [
        row({
          key: 'signatory',
          tone: 'danger',
          icon: 'signature',
          title: $localize`:@@admin.home.attention.signatory.title:Nikdo nepodepisuje potvrzení o daru`,
          meta: $localize`:@@admin.home.attention.signatory.meta:Web je proto dárcům nevystaví.`,
          link: PEOPLE,
        }),
      ]
    : [];
}

function importRows({ importLoad, importState }: AttentionSources): AttentionRow[] {
  if (importLoad === 'error') {
    return [
      failed(
        'import',
        'bank',
        $localize`:@@admin.home.attention.import.failed:Stav stahování plateb se nepodařilo zjistit; zkuste to znovu v kartě níže.`,
        null,
      ),
    ];
  }
  if (importLoad !== 'ready' || importState === null) {
    return [];
  }
  const outage = importState.reportedOutage;
  if (outage) {
    const step = IMPORT_NEXT_STEPS[outage];
    const failures = importState.consecutiveFailures;
    const reason = IMPORT_FAILURE_LABELS[outage];
    const outageRow = row({
      key: 'import',
      tone: 'warning',
      icon: 'bank',
      title: $localize`:@@admin.home.attention.import.outage.title:Platby z banky se nestahují`,
      meta: $localize`:@@admin.home.attention.import.outage.meta:${failures}:failures:× za sebou, fond o tom dostal e-mail. Důvod: ${reason}:reason:.`,
      step: `${NEXT_STEP_LABEL} ${step.text}`,
    });
    if (step.link === null) {
      return [outageRow];
    }
    const target = NEXT_STEP_LINKS[step.link];
    return [
      outageRow,
      row({
        key: 'import-next',
        tone: 'action',
        title: target.label,
        link: { path: target.path, fragment: target.fragment },
      }),
    ];
  }
  if (importState.lastAttemptedAt == null) {
    return [
      row({
        key: 'import',
        tone: 'warning',
        icon: 'bank',
        title: $localize`:@@admin.home.attention.import.neverAttempted.title:Stahování plateb ještě neproběhlo`,
        meta: $localize`:@@admin.home.attention.import.neverAttempted.meta:Pokud to trvá déle než hodinu, zkontrolujte v Nastavení token Fio API.`,
        link: { path: '/sprava/nastaveni', fragment: undefined },
      }),
    ];
  }
  return [];
}

function unpairedRows({ unpairedLoad, unpaired }: AttentionSources): AttentionRow[] {
  if (unpairedLoad === 'error') {
    return [
      failed(
        'unpaired',
        'payments',
        $localize`:@@admin.home.attention.unpaired.failed:Platby čekající na přiřazení se nepodařilo zjistit.`,
        'unpaired',
      ),
    ];
  }
  if (unpairedLoad !== 'ready' || unpaired === null || unpaired.count === 0) {
    return [];
  }
  return [
    row({
      key: 'unpaired',
      tone: 'task',
      icon: 'payments',
      title: unpairedCount(unpaired.count),
      value: `${formatMinorUnits(unpaired.totalMinor)}\u00a0Kč`,
      link: { path: '/sprava/platby', fragment: undefined },
    }),
  ];
}

function backupRows({ backupsLoad, backups }: AttentionSources): AttentionRow[] {
  if (backupsLoad === 'error') {
    return [
      failed(
        'backups',
        'backup',
        $localize`:@@admin.home.attention.backups.failed:Stav záloh se nepodařilo zjistit; zkuste to znovu v kartě níže.`,
        null,
      ),
    ];
  }
  if (backupsLoad !== 'ready' || backups === null) {
    return [];
  }
  const problems = backups.problems.map((problem) =>
    row({
      key: `backups-${problem}`,
      hook: 'attention-backups',
      tone: 'danger',
      icon: 'backup',
      title: BACKUP_PROBLEM_SUMMARIES[problem],
      meta: BACKUP_PROBLEM_ACTIONS[problem],
      link: BACKUPS,
    }),
  );
  return needsTechnician(backups)
    ? [
        ...problems,
        row({
          key: 'technician',
          tone: 'task',
          title: $localize`:@@admin.home.attention.technician.title:Zpráva pro technika`,
          copy: technicianMessage(backups),
        }),
      ]
    : problems;
}

function backupKeyRows({ backups }: AttentionSources): AttentionRow[] {
  const key = backups?.key;
  return key !== undefined && key.available && !key.confirmed
    ? [
        row({
          key: 'backup-key',
          tone: 'warning',
          icon: 'key',
          title: $localize`:@@admin.home.attention.backupKey.title:Klíč k zálohám si zatím nikdo neuložil`,
          meta: $localize`:@@admin.home.attention.backupKey.meta:Bez něj žádnou zálohu neobnovíte. Uložit ho má někdo ze správní rady, ne technik.`,
          link: { path: '/sprava/zalohy', fragment: 'klic-k-zaloham' },
        }),
      ]
    : [];
}

function signingKeyRows({
  signingKeysLoad,
  unpublishedSigningKeys,
  signingKeyWarnings,
}: AttentionSources): AttentionRow[] {
  if (signingKeysLoad === 'error') {
    return [
      failed(
        'signing-key',
        'key',
        $localize`:@@admin.home.attention.signingKey.failed:Klíč k ověřovacím QR kódům se nepodařilo zkontrolovat.`,
        'signingKeys',
      ),
    ];
  }
  if (signingKeysLoad !== 'ready') {
    return [];
  }
  const rows: AttentionRow[] = [];
  if (unpublishedSigningKeys.length > 0) {
    rows.push(
      row({
        key: 'signing-key',
        tone: 'danger',
        icon: 'key',
        title:
          pluralCategory(unpublishedSigningKeys.length) === 'one'
            ? $localize`:@@admin.home.attention.signingKey.unpublished.one:Klíč k ověřovacím QR kódům není zveřejněný`
            : $localize`:@@admin.home.attention.signingKey.unpublished.other:Klíče k ověřovacím QR kódům nejsou zveřejněné`,
        meta: unpublishedKeysSentence(unpublishedSigningKeys),
        link: SIGNING_KEY_SETTINGS,
      }),
    );
  }
  if (signingKeyWarnings.length > 0) {
    rows.push(
      row({
        key: 'signing-key-warnings',
        tone: 'danger',
        icon: 'key',
        title: $localize`:@@admin.home.attention.signingKey.warnings.title:Klíč k ověřovacím QR kódům potřebuje kontrolu`,
        meta: signingKeyWarnings.join(' '),
        link: SIGNING_KEY_SETTINGS,
      }),
    );
  }
  return rows;
}

function administratorRows({
  administratorsLoad,
  withoutSecondFactor,
}: AttentionSources): AttentionRow[] {
  if (administratorsLoad === 'error') {
    return [
      failed(
        'administrators',
        'administrators',
        $localize`:@@admin.home.attention.secondFactor.failed:Správce se nepodařilo zkontrolovat.`,
        'administrators',
      ),
    ];
  }
  if (withoutSecondFactor.length === 0) {
    return [];
  }
  return [
    row({
      key: 'administrators',
      tone: 'task',
      icon: 'administrators',
      title:
        pluralCategory(withoutSecondFactor.length) === 'one'
          ? $localize`:@@admin.home.attention.secondFactor.title.one:Správce nemá druhý faktor, správa se mu neotevře`
          : $localize`:@@admin.home.attention.secondFactor.title.other:Správci nemají druhý faktor, správa se jim neotevře`,
      meta: withoutSecondFactor.join(', '),
      link: { path: '/sprava/spravci', fragment: undefined },
    }),
  ];
}

function signatoryRows({ signatory }: AttentionSources): AttentionRow[] {
  switch (signatory) {
    case 'error':
      return [
        failed(
          'signatory',
          'signature',
          $localize`:@@admin.home.attention.signatory.failed:Nepodařilo se zkontrolovat, kdo podepisuje potvrzení o daru.`,
          'signatory',
        ),
      ];
    case 'unsigned':
      return [
        row({
          key: 'signature',
          tone: 'task',
          icon: 'signature',
          title: $localize`:@@admin.home.attention.signature.title:Podepisující nemá nahraný podpis`,
          meta: $localize`:@@admin.home.attention.signature.meta:Potvrzení o daru mají zatím jen čáru se jménem.`,
          link: PEOPLE,
        }),
      ];
    default:
      return [];
  }
}

export function unpairedCount(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.home.sections.unpaired.one:${count}:count: platba čeká na přiřazení`;
    case 'few':
      return $localize`:@@admin.home.sections.unpaired.few:${count}:count: platby čekají na přiřazení`;
    default:
      return $localize`:@@admin.home.sections.unpaired.many:${count}:count: plateb čeká na přiřazení`;
  }
}
