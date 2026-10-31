package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.shared.domain.LocaleCode;

public interface ReceiptTextSource {

    ReceiptTextSet textsFor(LocaleCode locale);
}
