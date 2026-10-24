package cz.novanadeje.app.shared.application.recovery;

import cz.novanadeje.app.shared.domain.Money;

import java.time.LocalDate;

public record SecondFactorRecoveryTarget(String accountNumber, String iban, Money amount, LocalDate usableFrom) {
}
