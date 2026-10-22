package cz.novanadeje.app.donations.interfaces.rest;

import java.time.Year;
import java.util.List;

record UnpairPaymentResponse(List<Integer> changedYearlyReceipts) {

    static UnpairPaymentResponse from(List<Year> changedYearlyReceipts) {
        return new UnpairPaymentResponse(changedYearlyReceipts.stream().map(Year::getValue).toList());
    }
}
