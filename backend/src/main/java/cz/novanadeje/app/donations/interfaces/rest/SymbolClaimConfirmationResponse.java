package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.bankaccount.SymbolClaimConfirmation;

import java.time.Year;
import java.util.List;

record SymbolClaimConfirmationResponse(int pairedCount, List<Integer> changedYearlyReceipts) {

    static SymbolClaimConfirmationResponse from(SymbolClaimConfirmation confirmation) {
        return new SymbolClaimConfirmationResponse(confirmation.pairedCount(),
                confirmation.changedYearlyReceipts().stream().map(Year::getValue).toList());
    }
}
