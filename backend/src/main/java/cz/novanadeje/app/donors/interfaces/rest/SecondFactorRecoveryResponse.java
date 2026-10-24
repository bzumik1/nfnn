package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.SecondFactorRecoveryInstructions;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

record SecondFactorRecoveryResponse(String message, Instant expiresAt, String accountNumber, String iban, long amountMinor, String currency,
                                    Optional<LocalDate> usableFrom) {

    static SecondFactorRecoveryResponse of(SecondFactorRecoveryInstructions instructions) {
        return new SecondFactorRecoveryResponse(instructions.message(), instructions.expiresAt(), instructions.accountNumber(),
                instructions.iban(), instructions.amount().amountMinor(), instructions.amount().currency().name(), instructions.usableFrom());
    }

    @Override
    public String toString() {
        return "SecondFactorRecoveryResponse[message=***, expiresAt=" + expiresAt + ", usableFrom=" + usableFrom + "]";
    }
}
