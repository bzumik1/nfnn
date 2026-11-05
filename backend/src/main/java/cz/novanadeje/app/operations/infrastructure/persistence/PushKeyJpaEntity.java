package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.push.PushKey;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "operations_push_key")
class PushKeyJpaEntity {

    static final short SINGLETON_ID = 1;
    static final int PUBLIC_KEY_LENGTH = 87;

    @Id
    private Short id;

    @Column(name = "public_key", nullable = false, length = PUBLIC_KEY_LENGTH)
    private String publicKey;

    @Column(name = "sealed_private_key", nullable = false, length = PushKey.MAX_SEALED_LENGTH)
    private String sealedPrivateKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PushKeyJpaEntity() {
    }

    static PushKeyJpaEntity fromDomain(PushKey key) {
        PushKeyJpaEntity entity = new PushKeyJpaEntity();
        entity.id = SINGLETON_ID;
        entity.publicKey = key.publicKey();
        entity.sealedPrivateKey = key.sealedPrivateKey();
        entity.createdAt = key.createdAt();
        return entity;
    }

    PushKey toDomain() {
        return new PushKey(publicKey, sealedPrivateKey, createdAt);
    }
}
