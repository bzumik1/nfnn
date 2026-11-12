package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "bank_logo")
class BankLogoJpaEntity {

    static final int MAX_FAILURE_LENGTH = 32;

    @Id
    @Column(name = "code", length = BankCode.LENGTH)
    private String code;

    @Column(name = "source_url", nullable = false, length = BankLogoSource.MAX_LENGTH)
    private String sourceUrl;

    @Column(name = "image_id")
    private UUID imageId;

    @Column(name = "fetched_at")
    private Instant fetchedAt;

    @Column(name = "checked_at")
    private Instant checkedAt;

    @Column(name = "last_failure", length = MAX_FAILURE_LENGTH)
    private String lastFailure;

    protected BankLogoJpaEntity() {
    }

    String code() {
        return code;
    }

    UUID imageId() {
        return imageId;
    }

    BankLogoRow toRow(String sha256) {
        return new BankLogoRow(code, sourceUrl, imageId, sha256, fetchedAt, checkedAt, lastFailure);
    }

    void apply(BankLogo logo) {
        sourceUrl = logo.source().url();
        imageId = logo.image().map(image -> image.id().value()).orElse(null);
        fetchedAt = logo.fetchedAt().orElse(null);
        checkedAt = logo.checkedAt().orElse(null);
        lastFailure = logo.lastFailure().map(failure -> failure.word()).orElse(null);
    }
}
