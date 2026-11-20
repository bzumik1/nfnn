/// <reference types="@angular/localize" />

import { Notice } from '../../shared/ui/live-notice/live-notice';
import { TestEmailResponse } from './setup/setup-api';

export interface TestedValues {
  host: string;
  sender: string;
}

export function testEmailNotice(result: TestEmailResponse, tried: TestedValues): Notice {
  const recipient = result.recipient;
  const host = tried.host;
  const sender = tried.sender;
  switch (result.outcome) {
    case 'SENT':
      return {
        kind: 'status',
        text: $localize`:@@operations.testEmail.sent:Zkušební e-mail odešel na ${recipient}:recipient:. Podívejte se prosím do schránky, i\u00a0do nevyžádané pošty. Když do pár minut nedorazí, zkontrolujte adresu odesílatele a\u00a0ověření její domény v\u00a0Brevo.`,
      };
    case 'UNREACHABLE':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.unreachable:K\u00a0serveru ${host}:host: se nepodařilo připojit. Zkontrolujte prosím název serveru a\u00a0port.`,
      };
    case 'TIMEOUT':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.timeout:Server ${host}:host: neodpověděl do 10\u00a0sekund. Zkontrolujte prosím port (Brevo používá 587) a\u00a0zkuste to znovu.`,
      };
    case 'STARTTLS_UNAVAILABLE':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.startTls:Server ${host}:host: nenabídl šifrované spojení, a\u00a0tak jsme mu heslo neposlali. Zkontrolujte prosím server a\u00a0port.`,
      };
    case 'SIGN_IN_REFUSED':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.signInRefused:Server odmítl přihlášení. Zkontrolujte prosím přihlašovací jméno a\u00a0heslo nebo klíč SMTP.`,
      };
    case 'SENDER_REFUSED':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.senderRefused:Server odmítl e-mail od adresy ${sender}:sender:. Zkontrolujte prosím, že je adresa odesílatele i\u00a0její doména v\u00a0Brevo ověřená.`,
      };
    case 'RECIPIENT_REFUSED':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.recipientRefused:Server odmítl doručit e-mail na ${recipient}:recipient:. Zkontrolujte prosím, že je adresa správná.`,
      };
    default:
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.failed:Zkušební e-mail se nepodařilo odeslat. Zkontrolujte prosím údaje serveru a\u00a0zkuste to znovu.`,
      };
  }
}
