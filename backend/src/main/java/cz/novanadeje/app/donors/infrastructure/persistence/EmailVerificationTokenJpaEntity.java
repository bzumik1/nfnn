package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_email_verification_token")
class EmailVerificationTokenJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "secret_hash", nullable = false, length = 64, unique = true)
    private String secretHash;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "new_email", length = 254)
    private String newEmail;

    @Column(name = "used_at")
    private Instant usedAt;

    protected EmailVerificationTokenJpaEntity() {
    }

    static EmailVerificationTokenJpaEntity fromDomain(EmailVerificationToken token) {
        EmailVerificationTokenJpaEntity entity = new EmailVerificationTokenJpaEntity();
        entity.id = token.id();
        entity.donorId = token.donorId().value();
        entity.secretHash = token.secretHash();
        entity.issuedAt = token.issuedAt();
        entity.expiresAt = token.expiresAt();
        entity.newEmail = token.newEmail().map(EmailAddress::value).orElse(null);
        entity.usedAt = token.usedAt().orElse(null);
        return entity;
    }

    EmailVerificationToken toDomain() {
        return EmailVerificationToken.reconstitute(id, new DonorId(donorId), secretHash, issuedAt, expiresAt,
                newEmail == null ? null : new EmailAddress(newEmail), usedAt);
    }
}
