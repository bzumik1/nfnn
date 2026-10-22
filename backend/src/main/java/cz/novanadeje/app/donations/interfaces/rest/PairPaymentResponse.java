package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.pairing.ManualPairingResult;

import java.time.Year;
import java.util.List;
import java.util.UUID;

record PairPaymentResponse(UUID donationId, List<Integer> changedYearlyReceipts) {

    static PairPaymentResponse from(ManualPairingResult result) {
        return new PairPaymentResponse(result.donationId().value(), result.changedYearlyReceipts().stream().map(Year::getValue).toList());
    }
}
