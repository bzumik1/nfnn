package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;

import java.util.UUID;

@Entity
@Table(name = "bank_logo_image")
class BankLogoImageJpaEntity implements Persistable<UUID> {

    private static final int SHA256_HEX_LENGTH = 64;

    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "sha256", nullable = false, length = SHA256_HEX_LENGTH)
    private String sha256;

    @Column(name = "webp", nullable = false)
    private byte[] webp;

    @Transient
    private boolean fresh;

    protected BankLogoImageJpaEntity() {
    }

    static BankLogoImageJpaEntity of(UUID id, String sha256, byte[] webp) {
        BankLogoImageJpaEntity entity = new BankLogoImageJpaEntity();
        entity.id = id;
        entity.sha256 = sha256;
        entity.webp = webp.clone();
        entity.fresh = true;
        return entity;
    }

    @Override
    public UUID getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return fresh;
    }
}
