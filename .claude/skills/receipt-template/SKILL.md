---
name: receipt-template
description: Change the PDF receipt template (templates/pdf/) or a receipt.* text and record the new bundle so ReceiptTemplateHistoryTest passes and issued receipts stay renderable
---
# Changing the receipt template

Issued receipts keep the bundle (markup + `receipt.*` texts) they were issued with, stored by SHA-256 in `receipt_template`, and every download renders it again byte for byte. A change creates a new bundle; every old one must stay renderable for good.

1. Change `backend/src/main/resources/templates/pdf/…` and/or `receipt.*` in `i18n/messages_{cs,en}.properties`; new texts in both languages (`en` receipts are bilingual).
2. `cd backend && ./gradlew test --tests "*ReceiptTemplateHistoryTest*"` (no Docker needed). It fails and writes `backend/build/receipt-history/<digest>/`: `template.json` plus sample receipts as `<sample>.data.json` and `<sample>.txt` (the text of every rendered page).
3. Read every `*.txt`: wording, numbers, order, both languages, nothing cut. Fix and rerun until right.
4. Copy the folder into `backend/src/test/resources/receipts/history/` and commit it with the change; the test then renders every recorded bundle from its samples.
5. Never edit or delete a recorded folder; never touch `resources/fonts/` (render profile 1 pins the DejaVu Sans digests).
6. In the PR say what changed on the receipt. The new bundle serves receipts issued after the deploy; a template change alone never re-issues an existing receipt, only changed certified data does.
