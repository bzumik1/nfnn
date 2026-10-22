package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaDonorRepository implements DonorRepository {

    private final DonorJpaRepository jpa;

    JpaDonorRepository(DonorJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(Donor donor) {
        jpa.save(DonorJpaEntity.fromDomain(donor));
    }

    @Override
    public void delete(DonorId id) {
        jpa.deleteById(id.value());
        jpa.flush();
    }

    @Override
    public Optional<Donor> findById(DonorId id) {
        return jpa.findById(id.value()).map(DonorJpaEntity::toDomain);
    }

    @Override
    public Optional<Donor> findByEmail(EmailAddress email) {
        return jpa.findByEmail(email.value()).map(DonorJpaEntity::toDomain);
    }

    @Override
    public boolean existsByEmail(EmailAddress email) {
        return jpa.existsByEmail(email.value());
    }

    @Override
    public boolean existsByVariableSymbol(VariableSymbol variableSymbol) {
        return jpa.existsByVariableSymbol(variableSymbol.value());
    }
}
