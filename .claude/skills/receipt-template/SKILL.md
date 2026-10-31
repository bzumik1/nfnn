---
name: receipt-template
description: Change what a donation receipt says (a receipt.* text) or how the browser draws it (receipt-pdf/ layout, the theme's --receipt-* tokens and fonts), record the new text set and hand Jakub a look sheet before merging
---
# Changing the donation receipt

Since slice 1.10 the server draws no receipt. A receipt is frozen data: `POST /api/donations/me/receipts` freezes the typed values, every `receipt.*` text of the message bundles (the verification caption and the images' alternative texts too) and the verification proof into `issued_receipt`, and the browser draws the PDF from that answer (`frontend/src/app/features/donations/receipt-pdf/`). So a receipt says what was frozen when it was issued, and looks as the current site draws it.

## A text (`receipt.*`)

1. Change the key in `backend/src/main/resources/i18n/messages.properties`, `messages_cs.properties` and `messages_en.properties` (an `en` receipt is bilingual, so every key has both languages).
2. `cd backend && ./gradlew test --tests "*ReceiptTextsHistoryTest*" --tests "*BundleReceiptTextSourceTest*" -PnoCucumber` (no Docker needed; in a cloud session see skill `cloud-session`). `ReceiptTextsHistoryTest` fails and writes the new set to `backend/build/receipt-texts/<sha256>.json`.
3. Read the candidate: wording, placeholders `{0}`…, both languages. Copy it into `backend/src/test/resources/receipts/texts/` and commit it with the change. Never edit or delete a recorded set: receipts were frozen with it.
4. A receipt already issued keeps its texts; only receipts issued after the deploy say the new words. The shared cases (`shared-cases/receipts/v1/frozen.json`) keep the set they name; a text change records a new set and leaves the cases as they are (`testing.md`, the `receipts/v1/frozen.json` row).
5. A new key that the browser prints is read in `receipt-document.ts` from the frozen texts. Decide what a receipt frozen without the key shows (today's captions fall back to `receipt-captions.ts`), and test both in `receipt-document.spec.ts`.

## The look (layout, theme, fonts)

1. The layout is `receipt-layout.ts` (geometry only); colours, sizes, leading and margins are the theme's `--receipt-*` tokens, read by `receipt-style.ts`; the fonts are the theme's `receipt/` folder (`scripts/make-receipt-fonts.sh`). `npm run lint:styles` checks the tokens and fonts of every theme (`frontend.md`, UI).
2. What a drawn receipt says is checked by `receipt-layout.spec.ts` against `shared-cases/receipts/v1/printed.json` (read back with `testing/pdf-reader.ts`). A change to what it prints changes those cases first and declares them (`testing.md`, Logic on both sides).
3. `npm test -- --watch=false` and `npm run e2e` (`e2e/receipt-pdf.spec.ts` downloads, reads back and times a receipt).

## The look sheet for Jakub

Any visible change to the receipt goes to Jakub as a look sheet before the merge, as in slice 1.9 (`/mnt/project-files/nfnn-plan/v3/revize/1.9/arch-vzhledu/`, `index.md` in Czech):
- every v2 sample of `regression/v2/receipts/` (single: person cs and en, company, replacement, diacritics, foreign address, manual gift, signature; yearly: person cs and en, one gift, large amounts, leap year, 40, 120 and 366 gifts) drawn by the same code the browser runs, page by page beside the previous look (`<sample>-strana-N.png`) and as PDFs;
- dates as `15. 03. 2026`, the 120-gift receipt with its large QR code;
- the signature and portrait only as synthetic images (a wave, a silhouette), never a real signature or photo: the repository and the sheet's folder are shared;
- what changed, in Czech, and each question as one decision card.

Put the sheet under `/mnt/project-files/nfnn-plan/v3/revize/<slice>/`, never in the repository. In the PR say what changed on the receipt and link the sheet.
