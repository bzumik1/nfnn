package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.domain.Money;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public record SecondFactorRecoveryInstructions(String message, Instant expiresAt, String accountNumber, String iban, Money amount,
                                               Optional<LocalDate> usableFrom) {

    @Override
    public String toString() {
        return "SecondFactorRecoveryInstructions[message=***, expiresAt=" + expiresAt + ", usableFrom=" + usableFrom + "]";
    }
}
