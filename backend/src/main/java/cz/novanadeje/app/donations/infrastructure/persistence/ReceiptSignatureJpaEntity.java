package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donation_person_receipt_signature")
class ReceiptSignatureJpaEntity {

    @Id
    @Column(name = "person_id")
    private UUID personId;

    @Column(name = "image_sha256", nullable = false, length = 64)
    private String imageSha256;

    @Column(name = "width", nullable = false)
    private short width;

    @Column(name = "height", nullable = false)
    private short height;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    protected ReceiptSignatureJpaEntity() {
    }

    static ReceiptSignatureJpaEntity of(UUID personId, String imageSha256, int width, int height, Instant uploadedAt) {
        ReceiptSignatureJpaEntity entity = new ReceiptSignatureJpaEntity();
        entity.personId = personId;
        entity.imageSha256 = imageSha256;
        entity.width = (short) width;
        entity.height = (short) height;
        entity.uploadedAt = uploadedAt;
        return entity;
    }

    UUID personId() {
        return personId;
    }

    String imageSha256() {
        return imageSha256;
    }

    int width() {
        return width;
    }

    int height() {
        return height;
    }

    Instant uploadedAt() {
        return uploadedAt;
    }
}
