import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrivacyPolicy } from './privacy-policy';

describe('Given the privacy policy page', () => {
  let fixture: ComponentFixture<PrivacyPolicy>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrivacyPolicy],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(PrivacyPolicy);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function texts(selector: string): string[] {
    return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll(selector)).map(
      (element) => element.textContent!.replace(/\s+/g, ' ').trim(),
    );
  }

  function sectionText(heading: string): string {
    const section = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('section')).find(
      (candidate) => candidate.querySelector('h2')?.textContent?.trim() === heading,
    );
    return section!.textContent!.replace(/\s+/g, ' ');
  }

  function purposeText(heading: string): string {
    const purpose = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.purpose'),
    ).find((candidate) => candidate.querySelector('h3')?.textContent?.trim() === heading);
    return purpose!.textContent!.replace(/\s+/g, ' ');
  }

  it('when it renders, then its only main heading names the policy', () => {
    expect(texts('h1')).toEqual(['Zásady ochrany osobních údajů']);
  });

  it('when it renders, then it walks through every part of the policy in order', () => {
    expect(texts('h2')).toEqual([
      'Správce osobních údajů',
      'Jaké údaje zpracováváme a proč',
      'Jaké e‑maily posíláme',
      'Jak dlouho údaje uchováváme',
      'Komu údaje předáváme',
      'Cookies',
      'Vaše práva',
      'Kontakt',
      'Účinnost',
    ]);
  });

  it('when it renders, then a named table of contents under the introduction links every part', () => {
    const toc = fixture.nativeElement.querySelector('nav.toc') as HTMLElement;
    expect(toc.getAttribute('aria-label')).toBe('Obsah');

    const entries = Array.from(toc.querySelectorAll('a')).map((link) => {
      const fragment = link.getAttribute('href')!.split('#')[1];
      const section = fixture.nativeElement.querySelector(`section#${fragment}`) as HTMLElement;
      return [link.textContent?.trim(), section?.querySelector('h2')?.textContent?.trim()];
    });
    expect(entries).toHaveLength(9);
    for (const [entry, heading] of entries) {
      expect(entry).toBe(heading);
    }
    expect(Array.from(toc.querySelectorAll('a')).map((link) => link.getAttribute('href'))).toEqual([
      '/zasady-ochrany-osobnich-udaju#spravce',
      '/zasady-ochrany-osobnich-udaju#udaje',
      '/zasady-ochrany-osobnich-udaju#emaily',
      '/zasady-ochrany-osobnich-udaju#uchovavani',
      '/zasady-ochrany-osobnich-udaju#prijemci',
      '/zasady-ochrany-osobnich-udaju#cookies',
      '/zasady-ochrany-osobnich-udaju#prava',
      '/zasady-ochrany-osobnich-udaju#kontakt',
      '/zasady-ochrany-osobnich-udaju#ucinnost',
    ]);
  });

  it('when it renders, then it lists the e-mails a donor gets, says what is never sent and that they cannot be turned off', () => {
    expect(texts('#emaily li')).toEqual([
      'po registraci odkaz k potvrzení e‑mailu a jednu připomínku, pokud registraci do druhého dne nepotvrdíte,',
      'odkaz pro obnovu hesla, když o něj požádáte,',
      'při změně e‑mailu potvrzovací odkaz na novou adresu a oznámení na dosavadní adresu,',
      'upozornění na změnu hesla, na zapnutí nebo vypnutí dvoufaktorového ověření a na přidání nebo odebrání přístupového klíče,',
      'upozornění, když se s vaší adresou někdo zkusí zaregistrovat nebo ji chce použít jiný účet,',
      'oznámení, že jsme vaše osobní údaje vymazali, když o výmaz požádáte.',
    ]);
    expect(texts('#emaily p')).toEqual([
      'Dárcům posíláme jen e‑maily, které patří k jejich účtu:',
      'Potvrzení o daru e‑mailem neposíláme, stáhnete si je ve svém dárcovském účtu. Neposíláme ani zpravodaj, reklamu nebo e‑mail po každém daru.',
      'Tyto e‑maily vypnout nejde, protože slouží k přihlášení a k ochraně vašeho účtu. Na zprávu z kontaktního formuláře vám odpovíme e‑mailem.',
    ]);
  });

  it('when it renders, then it explains each processing purpose on its own', () => {
    expect(texts('h3')).toEqual([
      'Dárcovský účet',
      'Evidence darů a potvrzení o daru',
      'Kontaktní formulář',
      'IP adresa a záznamy serveru',
    ]);
  });

  it('when it renders, then the introduction covers visitors who only open the site', () => {
    expect(texts('.ui-intro .ui-intro__lead').join(' ')).toContain(
      'napíšete nám nebo web jen navštívíte',
    );
  });

  it('when it renders, then the date it applies from stands under the heading and in the closing section', () => {
    expect(texts('.ui-intro .effective')).toEqual(['Platné od 29. října 2026']);
    expect(sectionText('Účinnost')).toContain('účinné od 29. října 2026');
  });

  it('when it renders, then it says a company ID fills the name and seat from ARES, which gets only the ID', () => {
    const account = purposeText('Dárcovský účet');

    expect(account).toContain('z veřejného registru ARES Ministerstva financí');
    expect(account).toContain('Registru pošleme jen IČO.');
    expect(account).toContain('před registrací zkontrolujete a můžete je změnit');
  });

  it('when it renders, then it says what a passkey leaves with us and that no fingerprint or face does', () => {
    const passkey = texts('li').find((item) => item.includes('přístupového klíče'));

    expect(passkey).toContain('veřejnou část přístupového klíče');
    expect(passkey).toContain('otisk prstu ani snímek obličeje k nám nikdy nedorazí');
  });

  it('when it renders, then it says a gift is assigned by the variable symbol and by a bank account the donor proved', () => {
    const donations = purposeText('Evidence darů a potvrzení o daru');

    expect(donations).toContain('podle vašeho variabilního symbolu');
    expect(donations).toContain(
      'i když ho místo do pole pro symbol napíšete do zprávy pro příjemce',
    );
    expect(donations).toContain('podle čísla účtu, ze kterého přišla');
    expect(donations).toContain(
      'Když nám ho prokážete poprvé a předtím ho neprokázal jiný dárce, přiřadíme vám i dřívější platby bez symbolu z tohoto účtu.',
    );
    expect(donations).not.toContain('přiřadíme vám tak i dřívější');
    expect(donations).toContain('Moje bankovní účty');
    expect(donations).toContain('párování vypnout');
    expect(donations).toContain(
      'které z takového účtu přijdou ode dne po vypnutí párování, vám už nepřiřazujeme',
    );
    expect(donations).not.toContain('odpoj');
  });

  it('when it renders, then it says which older symbol we show a donor at a proved account and that we keep their answer', () => {
    const olderSymbol =
      texts('.purpose p').find((paragraph) =>
        paragraph.includes('jedním jiným variabilním symbolem'),
      ) ?? '';

    expect(olderSymbol).toContain('platbou 1 Kč se zprávou „Ověření účtu“');
    expect(olderSymbol).toContain('který nemá žádný registrovaný dárce');
    expect(olderSymbol).toContain(
      'zobrazíme vám v dárcovském portálu tento symbol, počet plateb s ním a měsíce, ve kterých přišly (nikdy ne jejich částky)',
    );
    expect(olderSymbol).toContain(
      'Vaši odpověď, ano i ne, uložíme i s časem odpovědi u vašeho dárcovského účtu',
    );
    expect(olderSymbol).toContain('na tentýž symbol z tohoto účtu se znovu neptáme');
    expect(olderSymbol).toContain(
      'Odpovíte-li ano, přiřadíme vám dřívější i další platby s tímto symbolem z tohoto účtu stejně jako platby bez symbolu.',
    );
    expect(purposeText('Evidence darů a potvrzení o daru')).toContain(olderSymbol);
  });

  it('when it renders, then it says the name of the payer serves only to tell a company from a person before that question', () => {
    const donations = purposeText('Evidence darů a potvrzení o daru');

    expect(donations).toContain(
      'Jméno plátce k přiřazení nepoužíváme; jen u ověřovací platby podle něj poznáme, zda účet patří firmě, nebo osobě (viz níže).',
    );
    expect(donations).toContain(
      'porovnáme typ vašeho dárcovského účtu (osoba, nebo firma) se jménem plátce u ověřovací platby: když jméno ukazuje na firmu a vy jste se registrovali jako osoba, nebo naopak, nezeptáme se.',
    );
  });

  it('when it renders, then it says receipts are issued for gifts received from 1 January 2026', () => {
    expect(purposeText('Evidence darů a potvrzení o daru')).toContain(
      'Přiřazený dar zobrazíme v přehledu vašich darů a za dary přijaté od 1. ledna 2026 k němu vystavíme potvrzení o daru ve formátu PDF.',
    );
  });

  it('when it renders, then it lists every payment detail the bank statement gives us', () => {
    expect(texts('.purpose li')).toEqual(
      expect.arrayContaining([
        'variabilní, konstantní a specifický symbol,',
        'zprávu pro příjemce, pokud ji k platbě připíšete.',
      ]),
    );
  });

  it('when it renders, then it says IP addresses are held in memory for the limits and kept in the server logs', () => {
    const ipAddress = purposeText('IP adresa a záznamy serveru');

    expect(ipAddress).toContain('jen v operační paměti serveru');
    expect(ipAddress).toContain('do databáze ji neukládáme');
    expect(ipAddress).toContain('do svého provozního záznamu (logu)');
  });

  it('when it renders, then it counts requests in a window from the first one rather than over the last hour', () => {
    const ipAddress = purposeText('IP adresa a záznamy serveru');

    expect(ipAddress).toContain('během jedné hodiny od první žádosti');
    expect(ipAddress).not.toContain('za poslední hodinu');
  });

  it('when it renders, then it names the sign-in and registration limits next to the contact form and password reset', () => {
    const ipAddress = purposeText('IP adresa a záznamy serveru');

    expect(ipAddress).toContain('přihlášení, registraci, kontaktní formulář a obnovu hesla');
    expect(ipAddress).toContain(
      'během 15 minut od prvního pokusu z ní přijmeme nejvýš deset pokusů o přihlášení',
    );
    expect(ipAddress).toContain(
      'nejvýš pět registrací, pět zpráv z formuláře a pět žádostí o obnovu hesla',
    );
  });

  it('when it renders, then the logs it describes are those of both the reverse proxy and the web server', () => {
    const ipAddress = purposeText('IP adresa a záznamy serveru');

    expect(ipAddress).toContain('reverzní proxy');
    expect(ipAddress).toContain('webový server');
    expect(ipAddress).toContain('nastavené stáří nebo objem');
    expect(sectionText('Jak dlouho údaje uchováváme')).toContain('v provozních záznamech serveru');
  });

  it('when it renders, then it promises to delete contact messages from the web database a year after they were sent', () => {
    expect(purposeText('Kontaktní formulář')).toContain(
      'Z databáze webu ji automaticky smažeme jeden rok po odeslání.',
    );
    expect(sectionText('Jak dlouho údaje uchováváme')).toContain('zálohy');
  });

  it('when it renders, then it names the e-mail and network providers and the transfer to the USA', () => {
    const recipients = sectionText('Komu údaje předáváme');

    expect(recipients).toContain('Sendinblue SAS');
    expect(recipients).toContain('Brevo');
    expect(recipients).toContain('Cloudflare');
    expect(recipients).toContain('Gmail');
    expect(recipients).toContain('USA');
    expect(recipients).toContain('Data Privacy Framework');
    expect(recipients).not.toContain('vlastní infrastruktuře');
  });

  it('when it renders, then it says the site runs on a server owned by the foundation rather than at a hosting provider', () => {
    const recipients = sectionText('Komu údaje předáváme');

    expect(recipients).toContain(
      'neběží u poskytovatele hostingu ani v cloudu, ale na vlastním serveru nadačního fondu',
    );
    expect(recipients).not.toContain('autor webu');
  });

  it('when it renders, then it names the controller with its company ID and seat', () => {
    expect(texts('#spravce p').join(' ')).toContain(
      'Nová naděje - nadační fond, IČO 27278794, se sídlem Jiráskova 436, 473 01 Nový Bor',
    );
  });

  it('when it renders, then the contact e-mail is a mailto link', () => {
    const link = fixture.nativeElement.querySelector('a[href^="mailto:"]') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('mailto:info@nfnn.cz');
    expect(link.textContent!.trim()).toBe('info@nfnn.cz');
  });

  it('when it renders, then the contact section links to the contact form on the home page', () => {
    const link = fixture.nativeElement.querySelector('a[href="/#kontakt"]') as HTMLAnchorElement;

    expect(link.textContent!.trim()).toBe('kontaktní formulář');
  });
});
