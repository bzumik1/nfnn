package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.SecondFactorRecoveryInstructions;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

record SecondFactorRecoveryResponse(String message, Instant startedAt, Instant expiresAt, boolean resumed, String accountNumber, String iban,
                                    long amountMinor, String currency, Optional<LocalDate> usableFrom, String spayd) {

    static SecondFactorRecoveryResponse of(SecondFactorRecoveryInstructions instructions) {
        return new SecondFactorRecoveryResponse(instructions.message(), instructions.startedAt(), instructions.expiresAt(), instructions.resumed(),
                instructions.accountNumber(), instructions.iban(), instructions.amount().amountMinor(), instructions.amount().currency().name(),
                instructions.usableFrom(), instructions.paymentText().spayd());
    }

    @Override
    public String toString() {
        return "SecondFactorRecoveryResponse[message=***, startedAt=" + startedAt + ", expiresAt=" + expiresAt + ", resumed=" + resumed
                + ", usableFrom=" + usableFrom + ", spayd=***]";
    }
}
