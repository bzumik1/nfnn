package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Locale;

@Entity
@Table(name = "receipt_signing_key")
class ReceiptSigningKeyJpaEntity {

    @Id
    @Column(name = "key_id", length = 8)
    private String keyId;

    @Column(name = "public_key", nullable = false)
    private byte[] publicKey;

    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "seal", nullable = false, length = ReceiptSigningKey.MAX_SEAL_LENGTH)
    private String seal;

    protected ReceiptSigningKeyJpaEntity() {
    }

    static ReceiptSigningKeyJpaEntity of(ReceiptSigningKey key) {
        ReceiptSigningKeyJpaEntity entity = new ReceiptSigningKeyJpaEntity();
        entity.keyId = key.id().value();
        entity.publicKey = key.publicKey();
        entity.registeredAt = key.registeredAt();
        entity.status = key.status().name().toLowerCase(Locale.ROOT);
        entity.seal = key.seal();
        return entity;
    }

    ReceiptSigningKey toDomain() {
        return new ReceiptSigningKey(new ReceiptSigningKeyId(keyId), publicKey, registeredAt,
                ReceiptSigningKeyStatus.valueOf(status.toUpperCase(Locale.ROOT)), seal);
    }
}
