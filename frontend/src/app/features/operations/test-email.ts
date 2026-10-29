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
        text: $localize`:@@operations.testEmail.sent:Zkušební e-mail odešel na ${recipient}:recipient:. Podívejte se prosím do schránky, i do nevyžádané pošty. Když do pár minut nedorazí, zkontrolujte adresu odesílatele a ověření její domény v Brevo.`,
      };
    case 'UNREACHABLE':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.unreachable:K serveru ${host}:host: se nepodařilo připojit. Zkontrolujte prosím název serveru a port.`,
      };
    case 'TIMEOUT':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.timeout:Server ${host}:host: neodpověděl do 10 sekund. Zkontrolujte prosím port (Brevo používá 587) a zkuste to znovu.`,
      };
    case 'STARTTLS_UNAVAILABLE':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.startTls:Server ${host}:host: nenabídl šifrované spojení, a tak jsme mu heslo neposlali. Zkontrolujte prosím server a port.`,
      };
    case 'SIGN_IN_REFUSED':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.signInRefused:Server odmítl přihlášení. Zkontrolujte prosím přihlašovací jméno a heslo nebo klíč SMTP.`,
      };
    case 'SENDER_REFUSED':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.senderRefused:Server odmítl e-mail od adresy ${sender}:sender:. Zkontrolujte prosím, že je adresa odesílatele i její doména v Brevo ověřená.`,
      };
    case 'RECIPIENT_REFUSED':
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.recipientRefused:Server odmítl doručit e-mail na ${recipient}:recipient:. Zkontrolujte prosím, že je adresa správná.`,
      };
    default:
      return {
        kind: 'alert',
        text: $localize`:@@operations.testEmail.failed:Zkušební e-mail se nepodařilo odeslat. Zkontrolujte prosím údaje serveru a zkuste to znovu.`,
      };
  }
}
