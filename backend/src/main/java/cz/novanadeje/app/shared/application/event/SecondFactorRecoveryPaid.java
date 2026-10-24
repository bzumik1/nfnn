package cz.novanadeje.app.shared.application.event;

import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;

import java.time.Instant;
import java.util.UUID;

public record SecondFactorRecoveryPaid(UUID donorId, SecondFactorRecoveryCode code, String senderAccount, Instant at) {
}
