# Glossary

The words of the foundation's domain, so that threads, the Czech UI and the code name each thing the same way. Each term gives the Czech word the UI uses, the English name in code and docs, a one-sentence definition and, where a wrong word is common, the words to avoid. The glossary records what the project already says (`docs/requirements.md`, the i18n texts, `docs/api-contract.md`, the domain classes); it decides nothing: a new or disputed term is decided by Jakub and then written here in the PR that uses it.

How to apply it is in `CLAUDE.md`. Where the project uses two words for one thing and Jakub has not chosen yet, an entry lists both and puts neither on its _Avoid_ line. An English word on an _Avoid_ line also covers its Czech translation (user: „uživatel“), and the other way round.

Paths in code are under `backend/src/main/java/cz/novanadeje/app/` unless they name another root.

## People and roles

**Visitor**\
UI „návštěvník“ · Code: none (an unauthenticated request).\
Anyone on the public site without signing in: reads about the foundation, writes through the contact form and gives by bank transfer.

**Donor**\
UI „dárce“ · Code: `donors/domain/Donor` (the account), `donations/domain/donor/DonorRecord` (the donations context's copy of it, `donor_record`).\
A person or company with an account on the site, its own variable symbol and the donations paired to it.\
_Avoid_: user, sponsor, payer (the payer is whoever the bank statement names, see Bank payment)

**Donor type**\
UI „člověk“ / „firma“ · Code: `shared/domain/DonorType` `PERSON` / `COMPANY`.\
Whether a donor registered as an individual (name and address) or a company (name, IČO and seat); the receipt prints what the type requires. `PERSON` is not a person of the foundation (`content/domain/people/Person`).

**Administrator**\
UI „správce“ (menu „Správci“; once „administrátoři“) · Code: role `ADMIN` (`donors/domain/Role`), `/api/admin/**`, `Admin…` and `Administrator…` class names.\
A donor account that also holds the administrator role, granted and taken away only by another administrator, and that must hold a second factor.\
_Avoid_: superuser (the database superuser is something else)

**Server operator**\
UI „správce serveru“ (technical settings, backups, logs), also „technik“ („Pro technika“, „zpráva pro technika“) · Code: none.\
Whoever installs and runs the server and deploys new versions (today Jakub); not a role on the site.

**Connected application**\
UI „připojená aplikace“ (card „Připojené aplikace“, page „Připojení aplikace“ at `/pripojeni`); requirements also „konektor“ for it · Code: an OAuth client named by its `ClientId`, a token with a `scope` claim (`OAuthScope` `admin:read`, `admin:write`), `ConnectedAppsService`.\
An AI client (Claude on claude.ai or in Claude Code) that an administrator approved to act in the administration in their name, with reading only or reading and changes; the administrator disconnects it („odpojit“) on its card.\
_Avoid_: integration, bot

**Connector**\
UI „konektor“ · Code: `mcp/` (container `nfnn-mcp`, served at `/mcp`), tools `nfnn_*`.\
The MCP server through which a connected application reaches the administration API; it holds no secret and exchanges every token at the backend.\
_Avoid_: plugin

**Person of the foundation**\
UI „Lidé fondu“ (`/sprava/lide-fondu`), block „Kdo fond vede“; also „člen fondu“ (news editor) · Code: `content/domain/people/Person`, `shared/application/people/FoundationPerson`, `memberIds` in `nfnn_order_people`.\
Someone the About page shows as leading the foundation, with a name, a role on the site, board membership (`onBoard`, „správní rada“), a portrait and a web signature.\
_Avoid_: employee

**Receipt signatory**\
UI „osoba, která podepisuje“, the receipt role „Funkce na potvrzení“ · Code: `donations/domain/receipt/ReceiptSignatory`, `donation_receipt_signatory`.\
The one person of the foundation whose name, receipt role, portrait and receipt signature the receipts print; chosen and changed only in a browser session.\
_Avoid_: signer (in code `Ed25519ReceiptSigner` signs the verification QR and `NewsSigners` are the people under a news article)

## Money in and pairing

**Bank payment**\
UI „platba z banky“ (page „Platby z banky“) · Code: `donations/domain/bank/BankPayment` (`bank_payment`), read from a Fio `IncomingMovement`, identified by the bank's `BankTransactionId`.\
One incoming CZK movement on the foundation's Fio account as the bank reported it, paired or not.\
_Avoid_: „dar“ for a payment that is not paired

**Payment message**\
UI „zpráva pro příjemce“ · Code: the message of a `BankPayment` and of `PaymentDetails` (`SpaydText`).\
The text the payer's bank sends with a transfer; it may carry a donor's symbol, „Ověření účtu“ or a recovery code.\
_Avoid_: „zpráva“ alone next to the contact form (Contact message)

**Donation**\
UI „dar“ („Moje dary“, „Poslední dar“) · Code: `donations/domain/donation/Donation` (`donation`); „gift“ in the proof format (`SignedGift`), sync rows and prose.\
A bank payment paired to a donor (or one an administrator recorded, source `MANUAL`), with its amount, day, pairing method and status `RECEIVED` or `REFUNDED`.

**Donation purpose**\
UI „Obecný příspěvek“ / „Ověření účtu“ · Code: `DonationPurpose` `GENERAL` / `ACCOUNT_VERIFICATION`.\
Whether a donation is an ordinary gift or the 1 Kč payment with the message „Ověření účtu“ that proves a bank account; a verification counts in yearly totals and the yearly receipt but never as „Poslední dar“ and gets no single receipt.

**Variable symbol**\
UI „variabilní symbol“, short „VS“ · Code: `shared/domain/VariableSymbol`.\
The ten-digit number the site gives each donor at registration so that their transfers pair by themselves; `0` means a payment without a symbol.

**Older variable symbol**\
UI „starší symbol“, „starší variabilní symbol“ (page „Odpovědi o starších symbolech“), also „starý symbol“ (donor's pairing help) · Code: `SymbolClaim`, `SymbolClaimOffer`, `SymbolClaimAnswer` `CONFIRMED` / `DECLINED`, pairing method `CONFIRMED_SYMBOL`.\
A symbol a long-time donor used before the site existed and no registered donor holds; the site asks the donor whether its payments are theirs once they prove the account it came from, and an answer pairs them.\
_Avoid_: legacy symbol, the donor's symbol (that is the variable symbol)

**Symbol claim**\
UI „odpověď o starším symbolu“ · Code: `donations/domain/donor/SymbolClaim`.\
The donor's recorded „Ano“ or „Ne“ to the older-symbol question; only an administrator corrects it, in a browser session.

**Sender account**\
UI „bankovní účet“ (page „Bankovní účty“) · Code: `SenderAccount`, the link `SenderAccountLink` (`donor_sender_account`, status `ACTIVE`, `AWAITING_PAYMENT`, `DISCONNECTED`); „learned account“ and „account link“ in docs.\
A bank account a donor proved by a payment with their own symbol, from which payments without a symbol then pair to them; the donor never types it in.\
_Avoid_: „účet“ alone (it is also the donor's account on the site)

**Turning pairing from an account off and on**\
UI administration „Vypnout párování“ / „Zapnout párování“; donor „Znovu přiřazovat platby z účtu“, status „Nepřiřazujeme“ · Code: `POST …/bank-accounts/{id}/disconnect|reconnect`, status `DISCONNECTED`.\
Stopping pairing from a sender account (the donations stay) or starting it again (only new payments pair, after the next payment with the symbol).\
_Avoid_: „odpojit“ (disconnecting a connected application), delete (removing an account link is a separate, web-only action by an administrator)

**Shared account**\
UI „sdílený účet“ · Code: `UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT`.\
A sender account two donors proved; payments without a symbol from it stay unpaired and neither donor learns about the other.

**Excluded account**\
UI setting „Účty, podle kterých se nepáruje“; „sběrný účet“ in the donor's help, „vyloučené účty“ in requirements · Code: `ExcludedSenderAccounts`, setting `PAIRING_EXCLUDED_ACCOUNTS`, `UnpairedReason.EXCLUDED_SENDER_ACCOUNT`.\
A collecting account (payment gateway, the foundation's own, Česká pošta) the administrator excluded, so no payment from it pairs by account.

**Pairing**\
UI „párování“, „spárovat“; in the administration „přiřadit“ / „Zrušit přiřazení“ · Code: `pair` / `unpair`, `PaymentPairingService`, `PairingMethod` `VARIABLE_SYMBOL`, `SENDER_ACCOUNT`, `CONFIRMED_SYMBOL`, `MANUAL`.\
Turning a bank payment into a donation of one donor, automatically by symbol or sender account, or by hand by an administrator; unpairing deletes that donation again.

**Unpaired payment**\
UI „nespárovaná platba“, „čeká na přiřazení“, „platby bez dárce“ (report and administration home) · Code: a `BankPayment` without a donation, `UnpairedReason`.\
A bank payment the rules could not give to exactly one donor; an administrator pairs it by hand.

**Manual pairing**\
UI „ruční přiřazení“ · Code: `ManualPairingService`, `PairingMethod.MANUAL`.\
An administrator's pairing of one payment to a donor; it teaches no sender account, and a payment unpaired by hand is never paired again automatically.

**Bank import**\
UI „stahování z banky“ · Code: `ImportBankPaymentsService`, `FioImportScheduler`, `bank_import_state`, `ImportTrigger` `STARTUP`, `HOURLY`, `ON_DEMAND`.\
The hourly read of new movements from the Fio API with a read-only token, plus the donor's bank check on demand.\
_Avoid_: sync (sync is the device copy's download)

**Import outage**\
UI „porucha stahování z banky“ · Code: `ImportOutage`, `ImportAlert`, `bank_import_state.reported_outage`.\
Three counted import failures in a row or a rejected Fio token, reported once by e-mail and push alert, and once more on recovery.

**Payment details and QR payment**\
UI „QR platba“, „Poslat dar“, section „Přispět“ · Code: `donations/domain/payment/PaymentDetails`, `SpaydText`.\
The foundation's account, amount, message and (for a signed-in donor) variable symbol that the browser draws into a SPAYD QR code for the donor's banking app.

## Receipts

**Donation receipt**\
UI „potvrzení o daru“ · Code: `donations/domain/receipt/DonationReceipt` (`issued_receipt`), `ReceiptKind` `SINGLE` / `YEARLY`; „receipt“ in prose.\
The tax document certifying a donor's gifts, issued by the server as frozen data and drawn as a PDF by the browser; once issued it never changes.\
_Avoid_: „potvrzení“ alone where an e-mail confirmation could be meant, certificate, invoice

**Single receipt**\
UI „potvrzení k jednotlivému daru“ (requirements also „potvrzení o jednotlivém daru“) · Code: `ReceiptKind.SINGLE`.\
A receipt for one received donation, available at once and never for an account verification or a donation an active yearly receipt already lists.

**Yearly receipt**\
UI „roční potvrzení“, „potvrzení za rok …“ · Code: `ReceiptKind.YEARLY`.\
A receipt for all of a donor's donations of a completed Prague calendar year; issuing it replaces the active single receipts of the gifts it lists.\
_Avoid_: annual receipt

**Bulk yearly receipts**\
UI „Hromadná potvrzení“ · Code: `YearlyReceiptsService`, `nfnn_yearly_receipts`, `nfnn_issue_receipts`.\
Issuing the yearly receipts of many donors at once in the administration, drawn by the browser into one PDF for printing.

**Issue a receipt**\
UI „vystavit“, „vystavené potvrzení“ and „vydat“, „vydané potvrzení“ · Code: `issue`, `DonationReceiptIssuer`.\
Giving a receipt its number and freezing its content; repeating the request with unchanged data returns the active receipt instead of a new one.

**Receipt number**\
UI „číslo potvrzení“ · Code: `ReceiptNumber`.\
The sequential number the server gives each issued receipt under the donor's lock.

**Replaced receipt**\
UI „nahrazené novějším“, the new one „náhradní potvrzení“ · Code: `ReceiptStatus.REPLACED`, `ReplacedReceipt`.\
A receipt superseded by a newer one with a new number that names what it replaces (changed data, or a yearly receipt covering the gift).

**Withdrawn receipt**\
UI „zrušené potvrzení“ („Fond toto potvrzení zrušil“) · Code: `ReceiptStatus.WITHDRAWN`, `ReceiptWithdrawal`, `ReceiptWithdrawalReason.DONATIONS_CHANGED`.\
An active yearly receipt the site cancelled at once because an administrator unpaired a gift it lists; the next yearly receipt of that year names it.

**Outdated receipt**\
UI on the verification page: valid on the day it was issued, the donor's gifts have changed since · Code: `ReceiptStanding.OUTDATED`.\
How verification describes a withdrawn receipt whose data were correctly signed: true when issued, superseded by the donor's later receipts.

**Receipt verification**\
UI „Ověřit potvrzení“, page `/overit`, „ověřovací QR“ · Code: `donations/domain/receipt/proof` (`SignedReceipt`, `ReceiptProofBody`), `ReceiptVerification`, `POST /api/donations/receipts/status`.\
Checking a receipt's verification QR, the foundation's signature over what the paper says, in the browser, by anyone and without an account.

**Receipt signing key**\
UI „Klíč k ověřovacím QR kódům“; „podpisový klíč“ in requirements and roadmap · Code: `donations/domain/signing/ReceiptSigningKey` (`receipt_signing_key`, status `ACTIVE` / `REVOKED`), seed `secrets/receipt-signing-key`.\
The Ed25519 key the server signs verification QR codes with; the site publishes its public half.\
_Avoid_: „klíč“ alone

**Key withdrawal**\
UI „zneplatnění klíče“ (until 2026-11-05 „stažení“) · Code: `ReceiptSigningKeyWithdrawal`, `ReceiptSigningKeyWithdrawn`, published status `revoked`.\
The web-only step that marks a leaked receipt signing key as no longer trusted; the server then restarts with a new key.\
_Avoid_: „stáhnout“ / „stažení“ (Jakub renamed it: it reads as a download and the step cannot be undone)

**Receipt signature**\
UI „podpis na potvrzení“ · Code: `ReceiptSignatureService`, `SignatureImage` (scan), `SignatureVector` (SVG), `donation_person_receipt_signature`.\
The signatory's handwritten signature printed on receipts, uploaded only in a browser session.\
_Avoid_: „podpis na webu“ (a different image)

**Web signature**\
UI „podpis na webu“ · Code: `/api/admin/content/people/{id}/web-signature`, `WebSignatureRequest`.\
A public image of a person's signature under the founders' note on the About page; the connector may set and remove it.\
_Avoid_: receipt signature

**Portrait**\
UI „portrét“ · Code: `PersonDetails.portrait`, `PrintPortrait`.\
A person of the foundation's photo on the About page, the receipt's signature card and the round avatar of a linked donor in the administration.\
_Avoid_: profile photo (donors have none)

## Account and security

**Donor account**\
UI „účet“, „Můj přehled“, „Údaje a zabezpečení“ · Code: `Donor`, `/api/donors/me`.\
A donor's registration on the site with e-mail, profile, sign-in methods, devices and connected applications.\
_Avoid_: „účet“ where a bank account is meant

**Registration**\
UI „registrace“, „Založit účet“ · Code: `DonorRegistered`, `RegistrationReminders`, `RegistrationReturn`.\
Creating a donor account as a person or a company; the account works only after the e-mail confirmation, and a donor who does not confirm by the next day gets one reminder.

**E-mail confirmation**\
UI „potvrzení e-mailu“ (`/potvrzeni-emailu`), also „potvrzení registrace“ (settings texts) · Code: `EmailVerificationToken`, `email_verified_at`.\
The link a new or changed address receives; until it is opened the donor cannot sign in and nothing pairs to their symbol.\
_Avoid_: „potvrzení“ alone (a receipt)

**Passkey**\
UI „přístupový klíč“ · Code: `donors/domain/Passkey` (WebAuthn).\
A sign-in credential kept by the donor's device or password manager; an account may hold up to ten and need no password, and a passkey counts as a second factor.\
_Avoid_: „klíč“ alone (backup key, signing key)

**Second factor**\
UI „dvoufaktorové ověření“ and „druhý faktor“; its code „kód z aplikace“ or „kód z ověřovací aplikace“ · Code: `SecondFactor`, `Totp`, `SecondFactorCodes`.\
The six-digit code from an authenticator app (or a passkey) asked after the password; every administrator must hold one.\
_Avoid_: backup codes (there are none)

**Fresh second factor**\
UI a new code or a passkey, asked again · Code: `FreshSecondFactorRequired`.\
A second factor confirmed again at the moment of a sensitive step (showing the backup key, withdrawing a signing key, approving a connected application).

**Second factor recovery**\
UI „Obnova přístupu“ (platba 1 Kč se zprávou „OBNOVA …“) · Code: `SecondFactorRecovery`, `SecondFactorRecoveryCode`, `SecondFactorRecoveryPaid`.\
A donor turning off their own lost second factor with a 1 Kč payment carrying a one-time code from a bank account proven at least seven days earlier.\
_Avoid_: „obnova“ alone (password reset and restore from a backup are also „obnova“)

**Password reset**\
UI „obnova hesla“ · Code: `PasswordResetToken`, `DonorPasswordResetService`.\
Setting a new password from an e-mailed link; refused to an administrator who holds no second factor.

**Device**\
UI „zařízení“ (card „Přihlášená zařízení“) · Code: `donors/domain/DonorDevice` (`donor_device`), `DeviceSignOuts`.\
One sign-in of a browser or the installed app, named by platform and browser; signing it out ends its session within 30 seconds.

**Session kind**\
UI „Zapamatovat si mě“, „Cizí počítač“ · Code: `SessionKind` `APP`, `REMEMBERED`, `BROWSER`, `PUBLIC`.\
How long a sign-in lasts without use (the installed app 400 days, remembered 14 days by default, a browser 12 hours, a public computer one hour); it grants nothing.

**Installed app**\
UI „aplikace“, „Přidat na plochu“ · Code: the web as an app (`frontend/src/app/core/install/`, `ngsw-worker.js`), `SessionKind.APP`.\
The site added to a phone's or computer's home screen, opening without the address bar.\
_Avoid_: „aplikace“ alone where a connected application or the authenticator app is meant

**Device copy**\
UI „Data v tomto zařízení“ (the donor's), „kopie správy“ (the administration's) · Code: `frontend/src/app/core/device/` (`DeviceVault`), `GET /api/donations/me/sync`, `/api/admin/{donations,donors}/sync`; „device copy“ and „administration copy“ in docs.\
The encrypted copy of a donor's or the whole administration's data that the browser keeps on the device for offline reading.\
_Avoid_: cache, backup

**Administration lock**\
UI „Odemknout“ the administration (`frontend/src/app/features/admin/lock/`), „Zamykají se po 5 minutách mimo aplikaci“ · Code: `AdministrationDeviceService.unlock`, `POST /api/admin/donors/devices/current/unlock`.\
The lock on the administration copy on a device, opened again with the password and a code or with a passkey.

**Erasure**\
UI „výmaz podle GDPR“, „vymazat“, „vymazaný dárce“; in the donor's „Údaje a zabezpečení“ the card „Smazání účtu“ · Code: `DonorErasureService`, `DonorErased`, `ErasedPersonalData`, `DonorRecordErased`; the audit text says „anonymized“.\
The administrator's irreversible, web-only replacement of a donor's name, address, e-mail and credentials with placeholders, on the donor's request; donations and issued receipts stay for accounting.

## Administration

**Administration**\
UI „správa“ (`/sprava`) · Code: `/api/admin/**`, `frontend/src/app/features/admin/`, `AdministrationHolders`.\
The part of the site where administrators do everything the foundation needs, in a browser or through a connected application.\
_Avoid_: admin panel in UI texts

**Web-only action**\
UI none (the connector refuses it) · Code: `BrowserSessionAuthorizationManager`, `BROWSER_ONLY_*`, `AdminHandlerReach`.\
An administration action only a browser session may take because it is dangerous or irreversible (deletions, erasure, the administrator role, secrets, backups' download and restore, the receipt signatory and signatures, among others in `.claude/rules/security.md`).

**Donor card**\
UI „karta dárce“ · Code: `frontend/src/app/features/admin/donor-detail/`.\
The administration page of one donor: account, bank accounts, donations, receipts and the actions on them.

**Audit trail**\
UI „Historie změn“ · Code: `shared/application/audit/AdminActionTrail`, event `AdminActionPerformed`, `admin_action`.\
The record of every change by an administrator or a connected application, as a Czech sentence with who and when.\
_Avoid_: log (logs are the server's files under „Logy a diagnostika“)

**Monthly report**\
UI „Měsíční e-mail“ (route `/sprava/prehledy`), also „měsíční report“ and „měsíční přehled“ · Code: `donations/domain/report/MonthlyReport`, `MonthlyReportScheduler`.\
The e-mail with the previous month's donors, donations, unpaired payments and import status, sent to the report's recipients, who also receive the alerts.

**Alert**\
UI „upozornění“ (e-mailem; on a device the page and section „Upozornění“, formerly „Upozornění na telefon“, Jakub 2026-11-07) · Code: `OperationalAlert`, `MonitoredArea` `BANK_IMPORT`, `BACKUPS`, `MAIL`, `PushSubscription`, `PushMessageKind`.\
A message to the administrators that an import, backups or mail stopped working or works again, sent once per outage and once on recovery.\
_Avoid_: notification for these (security e-mails to a donor are not alerts)

**Settings**\
UI „Nastavení“, „Technické nastavení (pro správce serveru)“ · Code: `operations/domain/settings/Setting`, `operations_setting`.\
Values the administrator changes on `/sprava/nastaveni`; secrets among them (passwords, tokens) change only in a browser session and are never returned.

**First setup**\
UI „první nastavení“ (`/prvni-nastaveni`) · Code: `/api/operations/setup…`, `SetupCode`.\
The browser wizard a fresh installation opens to enter the server's settings or restore from a backup; open without a code only from the home network.

**Backup**\
UI „záloha“ (page „Zálohy“) · Code: `operations/domain/backup/BackupFile`, `BackupKind`, container `nfnn-backup`.\
The encrypted nightly and start-up dump of the database, kept 30 days.

**Test restore**\
UI „zkušební obnova“ · Code: `BackupRequestKind.TEST_RESTORE`, `BackupHealth`.\
The weekly restore of the latest backup into a scratch database that proves backups can be read.

**Restore**\
UI „obnova ze zálohy“ · Code: `RestoreFile`, `RestorePending`, `RestoreRevocations`.\
Replacing the site's data with a backup (a backup is taken first); it signs everybody out.\
_Avoid_: „obnova“ alone

**Backup key**\
UI „klíč k zálohám“ (24 Czech words) · Code: `BackupKey`, `BackupKeyWords`, `BACKUP_KEY`.\
The key the server generated to encrypt every backup, shown only as 24 words with a fresh second factor and needed to restore on another server.\
_Avoid_: „klíč“ alone

## Content

**News article**\
UI „aktualita“ (tab „Aktuality“), also „článek“ in editor texts · Code: `content/domain/news/NewsArticle`; the roadmap still says „Novinky“ for the tab.\
A dated post the administrator writes, with a title, address, tag, perex, Markdown text and one photo.\
_Avoid_: blog post

**Project**\
UI „projekt“ (tab „Pomáháme“) · Code: `content/domain/project/Project`, `ProjectCategory` `CHILDREN`, `ADULTS`, `ANIMALS`, `OTHER`.\
A help the foundation gave, with a year and the category of whom it helped, ordered on the site as the administrator chose.

**Draft / publish / take off the site**\
UI „koncept“, „zveřejnit“, „Stáhnout z webu“ · Code: `publishedOn` of `NewsArticle` and `Project`.\
A draft is seen only by administrators; publishing sets the day it appears (judged by the Prague date on the server); taking it off hides it again.

**Address (slug)**\
UI „adresa“ · Code: `content/domain/Slug`, `FormerSlugs`.\
The Czech path of an article or project without diacritics; a former address keeps leading to the new one.

**About section**\
UI „O nás“ (photo at `/sprava/o-nas`) · Code: `content/domain/about/AboutSection`, `AboutPhoto`.\
The page about the foundation with its story, people, contact and the photo uploaded in the administration.

**Founders' note**\
UI „slovo zakladatelů“ · Code: `content/domain/people/FoundersNote`.\
The optional plain text under the people's cards on the About page, followed by their web signatures.

**Focal point**\
UI „místo, které musí zůstat vidět“ · Code: `content/domain/media/FocalPoint`.\
The point of a photo the administrator marked, around which every crop of it is cut.

**Contact message**\
UI „zpráva“ from „Kontakt“ · Code: `contact/domain/ContactMessage`.\
A message from the public contact form, forwarded to the foundation's mailbox and deleted from the site a year after it arrived.
