package cz.novanadeje.app.donations.application.bankaccount;

import java.time.Year;
import java.util.List;

public record SymbolClaimConfirmation(int pairedCount, List<Year> changedYearlyReceipts) {

    public SymbolClaimConfirmation {
        if (pairedCount < 0 || changedYearlyReceipts == null) {
            throw new IllegalArgumentException("A symbol claim confirmation needs a paired count and the changed yearly receipts");
        }
        changedYearlyReceipts = List.copyOf(changedYearlyReceipts);
    }
}
