package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.importing.BankCheck;

import java.time.Instant;

record BankCheckResponse(Instant bankDataAsOf, boolean checking) {

    static BankCheckResponse from(BankCheck check) {
        return new BankCheckResponse(check.bankDataAsOf().orElse(null), check.checking());
    }
}
