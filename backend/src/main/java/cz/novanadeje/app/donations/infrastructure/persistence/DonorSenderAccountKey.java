package cz.novanadeje.app.donations.infrastructure.persistence;

import java.io.Serializable;
import java.util.UUID;

public record DonorSenderAccountKey(UUID donorId, String accountNumber, String bankCode) implements Serializable {
}
