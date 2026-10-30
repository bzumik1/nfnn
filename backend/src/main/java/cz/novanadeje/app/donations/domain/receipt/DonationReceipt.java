package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;

public final class DonationReceipt {

    private final DonationReceiptId id;
    private final DonorReference donor;
    private final Instant issuedAt;
    private final ReceiptFingerprint fingerprint;
    private final FrozenReceipt frozen;
    private final DonationReceiptId supersedes;
    private ReceiptStatus status;
    private Instant supersededAt;

    private DonationReceipt(DonationReceiptId id, DonorReference donor, Instant issuedAt, ReceiptFingerprint fingerprint, FrozenReceipt frozen,
                            Optional<DonationReceiptId> supersedes, ReceiptStatus status, Optional<Instant> supersededAt) {
        this.id = require(id, "Receipt id");
        this.donor = require(donor, "Donor reference");
        this.issuedAt = require(issuedAt, "Issue time");
        this.fingerprint = require(fingerprint, "Fingerprint");
        this.frozen = require(frozen, "Frozen receipt");
        this.supersedes = require(supersedes, "Superseded receipt").orElse(null);
        this.status = require(status, "Status");
        this.supersededAt = require(supersededAt, "Supersede time").orElse(null);
        if ((status == ReceiptStatus.REPLACED) != (this.supersededAt != null)) {
            throw new IllegalArgumentException("A receipt has its supersede time exactly when it was replaced");
        }
    }

    public static DonationReceipt issue(DonationReceiptId id, DonorReference donor, Instant issuedAt, ReceiptFingerprint fingerprint,
                                        FrozenReceipt frozen, Optional<DonationReceiptId> supersedes) {
        return new DonationReceipt(id, donor, issuedAt, fingerprint, frozen, supersedes, ReceiptStatus.ACTIVE, Optional.empty());
    }

    public static DonationReceipt reconstitute(DonationReceiptId id, DonorReference donor, Instant issuedAt, ReceiptFingerprint fingerprint,
                                               FrozenReceipt frozen, Optional<DonationReceiptId> supersedes, ReceiptStatus status,
                                               Optional<Instant> supersededAt) {
        return new DonationReceipt(id, donor, issuedAt, fingerprint, frozen, supersedes, status, supersededAt);
    }

    public void markSuperseded(Instant at) {
        require(at, "Supersede time");
        if (status != ReceiptStatus.ACTIVE) {
            throw new IllegalStateException("Receipt " + number() + " is " + status + ", so it cannot be superseded");
        }
        status = ReceiptStatus.REPLACED;
        supersededAt = at;
    }

    public boolean certifies(ReceiptFingerprint candidate) {
        return fingerprint.equals(candidate);
    }

    public boolean isActive() {
        return status == ReceiptStatus.ACTIVE;
    }

    public DonationReceiptId id() {
        return id;
    }

    public DonorReference donor() {
        return donor;
    }

    public ReceiptKind kind() {
        return frozen.document().kind();
    }

    public Optional<DonationId> donation() {
        return kind() == ReceiptKind.SINGLE ? Optional.of(frozen.document().lines().getFirst().donationId()) : Optional.empty();
    }

    public Optional<Year> year() {
        return frozen.document().year();
    }

    public ReceiptNumber number() {
        return frozen.document().number();
    }

    public LocalDate issuedOn() {
        return frozen.document().issuedOn();
    }

    public Instant issuedAt() {
        return issuedAt;
    }

    public LocaleCode locale() {
        return frozen.document().locale();
    }

    public ReceiptFingerprint fingerprint() {
        return fingerprint;
    }

    public FrozenReceipt frozen() {
        return frozen;
    }

    public Optional<DonationReceiptId> supersedes() {
        return Optional.ofNullable(supersedes);
    }

    public ReceiptStatus status() {
        return status;
    }

    public Optional<Instant> supersededAt() {
        return Optional.ofNullable(supersededAt);
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
