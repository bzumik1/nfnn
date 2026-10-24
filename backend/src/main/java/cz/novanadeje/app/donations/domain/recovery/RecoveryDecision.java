package cz.novanadeje.app.donations.domain.recovery;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;

public sealed interface RecoveryDecision {

    record Recover(DonorRecord donor, SecondFactorRecoveryCode code, SenderAccount account) implements RecoveryDecision {
    }

    record Refuse(RecoveryRefusal reason) implements RecoveryDecision {
    }
}
