package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

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

    @Override
    public List<Donor> findAdministrators() {
        return jpa.findByRole(Role.ADMIN).stream().map(DonorJpaEntity::toDomain).toList();
    }

    @Override
    public List<Donor> findByIds(Collection<DonorId> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jpa.findAllById(ids.stream().map(DonorId::value).collect(Collectors.toSet())).stream().map(DonorJpaEntity::toDomain).toList();
    }
}
