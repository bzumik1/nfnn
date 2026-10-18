package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;

import java.time.Instant;

public record LearnedSenderAccount(SenderAccount account, BankPaymentId learnedFrom, Instant learnedAt) {

    public LearnedSenderAccount {
        if (account == null || learnedFrom == null || learnedAt == null) {
            throw new IllegalArgumentException("A learned sender account needs the account, the payment it was learned from and the time");
        }
    }
}
