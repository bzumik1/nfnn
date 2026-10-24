package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "donor_passkey")
class PasskeyJpaEntity {

    private static final String TRANSPORT_SEPARATOR = ",";

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "credential_id", nullable = false, length = Passkey.MAX_CREDENTIAL_ID_LENGTH, unique = true)
    private String credentialId;

    @Column(name = "credential_data", nullable = false)
    private byte[] credentialData;

    @Column(name = "sign_count", nullable = false)
    private long signCount;

    @Column(name = "transports", nullable = false, length = 100)
    private String transports;

    @Column(name = "name", nullable = false, length = Passkey.MAX_NAME_LENGTH)
    private String name;

    @Column(name = "relying_party_id", length = Passkey.MAX_RELYING_PARTY_ID_LENGTH)
    private String relyingPartyId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    protected PasskeyJpaEntity() {
    }

    static PasskeyJpaEntity fromDomain(Passkey passkey) {
        PasskeyJpaEntity entity = new PasskeyJpaEntity();
        entity.id = passkey.id().value();
        entity.donorId = passkey.donorId().value();
        entity.credentialId = passkey.credentialId();
        entity.credentialData = passkey.credentialData();
        entity.signCount = passkey.signCount();
        entity.transports = String.join(TRANSPORT_SEPARATOR, passkey.transports());
        entity.name = passkey.name();
        entity.relyingPartyId = passkey.relyingPartyId().orElse(null);
        entity.createdAt = passkey.createdAt();
        entity.lastUsedAt = passkey.lastUsedAt().orElse(null);
        return entity;
    }

    Passkey toDomain() {
        List<String> transportList = transports.isEmpty() ? List.of() : Arrays.asList(transports.split(TRANSPORT_SEPARATOR));
        return Passkey.reconstitute(new PasskeyId(id), new DonorId(donorId), credentialId, credentialData, signCount, transportList, name,
                relyingPartyId, createdAt, lastUsedAt);
    }
}
