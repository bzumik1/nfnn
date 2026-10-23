package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "receipt_image")
class ReceiptImageJpaEntity {

    @Id
    @Column(name = "sha256", length = 64)
    private String sha256;

    @Column(name = "media_type", nullable = false, length = 20)
    private String mediaType;

    @Column(name = "content", nullable = false)
    private byte[] content;

    @Column(name = "first_used_at", nullable = false)
    private Instant firstUsedAt;

    protected ReceiptImageJpaEntity() {
    }

    String mediaType() {
        return mediaType;
    }

    byte[] content() {
        return content;
    }
}
