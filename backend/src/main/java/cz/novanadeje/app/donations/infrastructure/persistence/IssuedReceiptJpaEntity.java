package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptVerification;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicUpdate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;

@Entity
@DynamicUpdate
@Table(name = "issued_receipt")
class IssuedReceiptJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 10)
    private ReceiptKind kind;

    @Column(name = "donation_id")
    private UUID donationId;

    @Column(name = "receipt_year")
    private Integer receiptYear;

    @Column(name = "number", nullable = false, unique = true, length = 11)
    private String number;

    @Column(name = "issued_on", nullable = false)
    private LocalDate issuedOn;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "locale", nullable = false, length = 2)
    private String locale;

    @Column(name = "fingerprint", nullable = false, length = 64)
    private String fingerprint;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private ReceiptStatus status;

    @Column(name = "schema_version", nullable = false)
    private Short schemaVersion;

    @Column(name = "frozen", nullable = false, columnDefinition = "text")
    private String frozen;

    @Column(name = "signature_image_sha256", length = 64)
    private String signatureImageSha256;

    @Column(name = "signing_key_id", nullable = false, length = 8)
    private String signingKeyId;

    @Column(name = "proof", nullable = false)
    private byte[] proof;

    @Column(name = "status_sha256", nullable = false, unique = true, length = 64)
    private String statusSha256;

    @Column(name = "supersedes_id")
    private UUID supersedesId;

    @Column(name = "superseded_at")
    private Instant supersededAt;

    protected IssuedReceiptJpaEntity() {
    }

    static IssuedReceiptJpaEntity fromDomain(DonationReceipt receipt) {
        FrozenReceipt frozen = receipt.frozen();
        IssuedReceiptJpaEntity entity = new IssuedReceiptJpaEntity();
        entity.id = receipt.id().value();
        entity.donorId = receipt.donor().value();
        entity.kind = receipt.kind();
        entity.donationId = receipt.donation().map(DonationId::value).orElse(null);
        entity.receiptYear = receipt.year().map(Year::getValue).orElse(null);
        entity.number = receipt.number().value();
        entity.issuedOn = receipt.issuedOn();
        entity.issuedAt = receipt.issuedAt();
        entity.locale = receipt.locale().tag();
        entity.fingerprint = receipt.fingerprint().value();
        entity.status = receipt.status();
        entity.schemaVersion = (short) frozen.schemaVersion();
        entity.frozen = FrozenReceiptColumn.write(frozen);
        entity.signatureImageSha256 = frozen.signatureImage().map(ContentDigest::value).orElse(null);
        entity.signingKeyId = frozen.verification().keyId().value();
        entity.proof = frozen.verification().proof().bytes();
        entity.statusSha256 = frozen.statusDigest().value();
        entity.supersedesId = receipt.supersedes().map(DonationReceiptId::value).orElse(null);
        entity.supersededAt = receipt.supersededAt().orElse(null);
        return entity;
    }

    void changedAs(DonationReceipt receipt) {
        this.status = receipt.status();
        this.supersededAt = receipt.supersededAt().orElse(null);
    }

    UUID getDonationId() {
        return donationId;
    }

    String getNumber() {
        return number;
    }

    DonationReceipt toDomain() {
        FrozenReceipt frozenReceipt = new FrozenReceipt(FrozenReceiptColumn.document(frozen), FrozenReceiptColumn.texts(frozen),
                Optional.ofNullable(signatureImageSha256).map(ContentDigest::new),
                new ReceiptVerification(new ReceiptSigningKeyId(signingKeyId), proof()));
        DonationReceipt receipt = DonationReceipt.reconstitute(
                new DonationReceiptId(id),
                new DonorReference(donorId),
                issuedAt,
                new ReceiptFingerprint(fingerprint),
                frozenReceipt,
                Optional.ofNullable(supersedesId).map(DonationReceiptId::new),
                status,
                Optional.ofNullable(supersededAt));
        if (!receipt.number().value().equals(number) || receipt.kind() != kind || !receipt.issuedOn().equals(issuedOn)
                || !receipt.locale().tag().equals(locale) || !receipt.donation().map(DonationId::value).equals(Optional.ofNullable(donationId))
                || !receipt.year().map(Year::getValue).equals(Optional.ofNullable(receiptYear))
                || !receipt.frozen().statusDigest().value().equals(statusSha256)) {
            throw new IllegalStateException("The issued receipt " + id + " disagrees with its frozen data");
        }
        return receipt;
    }

    private ReceiptProof proof() {
        return new ReceiptProof(Arrays.copyOf(proof, proof.length - ReceiptProof.SIGNATURE_BYTES),
                Arrays.copyOfRange(proof, proof.length - ReceiptProof.SIGNATURE_BYTES, proof.length));
    }
}
