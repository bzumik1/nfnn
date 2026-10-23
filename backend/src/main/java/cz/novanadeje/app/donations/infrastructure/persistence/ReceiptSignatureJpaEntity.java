package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "donation_receipt_signature")
class ReceiptSignatureJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

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

    static ReceiptSignatureJpaEntity of(String imageSha256, int width, int height, Instant uploadedAt) {
        ReceiptSignatureJpaEntity entity = new ReceiptSignatureJpaEntity();
        entity.id = SINGLETON_ID;
        entity.imageSha256 = imageSha256;
        entity.width = (short) width;
        entity.height = (short) height;
        entity.uploadedAt = uploadedAt;
        return entity;
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
