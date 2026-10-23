package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyId;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
class JpaPasskeyRepository implements PasskeyRepository {

    private final PasskeyJpaRepository jpa;

    JpaPasskeyRepository(PasskeyJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(Passkey passkey) {
        jpa.save(PasskeyJpaEntity.fromDomain(passkey));
    }

    @Override
    public Optional<Passkey> findById(PasskeyId id) {
        return jpa.findById(id.value()).map(PasskeyJpaEntity::toDomain);
    }

    @Override
    public Optional<Passkey> findByCredentialId(String credentialId) {
        return jpa.findByCredentialId(credentialId).map(PasskeyJpaEntity::toDomain);
    }

    @Override
    public List<Passkey> findByDonor(DonorId donorId) {
        return jpa.findByDonorIdOrderByCreatedAtAscIdAsc(donorId.value()).stream().map(PasskeyJpaEntity::toDomain).toList();
    }

    @Override
    public int countByDonor(DonorId donorId) {
        return jpa.countByDonorId(donorId.value());
    }

    @Override
    public void delete(PasskeyId id) {
        jpa.deleteById(id.value());
        jpa.flush();
    }

    @Override
    public int deleteAllOf(DonorId donorId) {
        return jpa.deleteAllByDonorId(donorId.value());
    }
}
