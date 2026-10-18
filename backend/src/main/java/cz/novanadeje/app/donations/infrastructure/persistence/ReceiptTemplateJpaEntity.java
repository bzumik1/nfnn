package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "receipt_template")
public class ReceiptTemplateJpaEntity {

    @Id
    @Column(name = "sha256", length = 64)
    private String sha256;

    @Column(name = "content", nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "first_used_at", nullable = false)
    private Instant firstUsedAt;

    protected ReceiptTemplateJpaEntity() {
    }

    String content() {
        return content;
    }
}
