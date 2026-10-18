package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.time.Year;
import java.util.Optional;

public record IssuedReceipt(byte[] content, ReceiptNumber number, ReceiptKind kind, Optional<Year> year, LocaleCode locale) {

    public IssuedReceipt {
        if (content == null || number == null || kind == null || year == null || locale == null) {
            throw new IllegalArgumentException("An issued receipt has its content, number, kind, year and locale");
        }
        content = content.clone();
    }

    static IssuedReceipt of(DonationReceipt receipt, byte[] content) {
        return new IssuedReceipt(content, receipt.number(), receipt.kind(), receipt.year(), receipt.locale());
    }

    @Override
    public byte[] content() {
        return content.clone();
    }
}
