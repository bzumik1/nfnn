package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public final class Donations {

    public static final Instant NOW = Instant.parse("2026-10-17T11:00:00Z");
    public static final DonorReference JANA = new DonorReference(UuidV7.generate(NOW));

    private Donations() {
    }

    public static Donation received(LocalDate receivedOn, long amountMinor) {
        return received(JANA, receivedOn, amountMinor);
    }

    public static Donation received(DonorReference donor, LocalDate receivedOn, long amountMinor) {
        return donation(donor, receivedOn, amountMinor, DonationStatus.RECEIVED);
    }

    public static Donation refunded(LocalDate receivedOn, long amountMinor) {
        return refunded(JANA, receivedOn, amountMinor);
    }

    public static Donation refunded(DonorReference donor, LocalDate receivedOn, long amountMinor) {
        return donation(donor, receivedOn, amountMinor, DonationStatus.REFUNDED);
    }

    public static Donation accountVerification(LocalDate receivedOn) {
        return Donation.reconstitute(DonationId.newId(NOW), JANA, Optional.of(BankPaymentId.newId(NOW)), receivedOn, Money.czk(100),
                DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(PairingMethod.VARIABLE_SYMBOL), Optional.empty(),
                Optional.empty(), DonationPurpose.ACCOUNT_VERIFICATION, NOW);
    }

    private static Donation donation(DonorReference donor, LocalDate receivedOn, long amountMinor, DonationStatus status) {
        return Donation.reconstitute(DonationId.newId(NOW), donor, Optional.of(BankPaymentId.newId(NOW)), receivedOn, Money.czk(amountMinor),
                DonationSource.BANK_TRANSFER, status, Optional.of(PairingMethod.VARIABLE_SYMBOL), NOW);
    }
}
