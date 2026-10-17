package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;

import java.time.Instant;
import java.util.UUID;

public record LearnedSenderAccount(SenderAccount account, UUID learnedFrom, Instant learnedAt) {

    public LearnedSenderAccount {
        if (account == null || learnedFrom == null || learnedAt == null) {
            throw new IllegalArgumentException("A learned sender account needs the account, the payment it was learned from and the time");
        }
    }
}
