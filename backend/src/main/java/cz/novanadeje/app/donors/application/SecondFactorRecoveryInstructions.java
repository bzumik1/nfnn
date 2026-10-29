package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryPaymentQr;
import cz.novanadeje.app.shared.domain.Money;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public record SecondFactorRecoveryInstructions(String message, Instant startedAt, Instant expiresAt, boolean resumed, String accountNumber,
                                               String iban, Money amount, Optional<LocalDate> usableFrom, SecondFactorRecoveryPaymentQr paymentQr) {

    @Override
    public String toString() {
        return "SecondFactorRecoveryInstructions[message=***, startedAt=" + startedAt + ", expiresAt=" + expiresAt + ", resumed=" + resumed
                + ", usableFrom=" + usableFrom + ", paymentQr=***]";
    }
}
