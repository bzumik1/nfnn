package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import cz.novanadeje.app.shared.infrastructure.search.AccentFolding;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Repository
class JpaDonorRepository implements DonorRepository {

    private final DonorJpaRepository jpa;
    private final EntityManager entityManager;

    JpaDonorRepository(DonorJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
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
    public int deleteUnconfirmedRegisteredBefore(Instant cutoff) {
        return jpa.deleteUnconfirmedRegisteredBefore(cutoff);
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
    public Optional<Donor> findByIdForUpdate(DonorId id) {
        return jpa.findByIdForUpdate(id.value()).map(DonorJpaEntity::toDomain);
    }

    @Override
    public Optional<Donor> findByEmailForUpdate(EmailAddress email) {
        return jpa.findByEmailForUpdate(email.value()).map(DonorJpaEntity::toDomain);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockEmail(EmailAddress email) {
        AdvisoryLock.DONOR_EMAIL_ADDRESSES.acquireFor(entityManager, email.value());
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockAdministrators() {
        AdvisoryLock.ADMINISTRATORS.acquireFor(entityManager);
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
    public List<Donor> findAll() {
        return jpa.findAllWithRoles().stream().map(DonorJpaEntity::toDomain).toList();
    }

    @Override
    public List<Donor> findByIds(Collection<DonorId> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jpa.findAllById(ids.stream().map(DonorId::value).collect(Collectors.toSet())).stream().map(DonorJpaEntity::toDomain).toList();
    }

    @Override
    public List<Donor> search(String query, int offset, int limit) {
        String escaped = AccentFolding.fold(query).replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return jpa.search(escaped, new OffsetPage(offset, limit)).stream().map(DonorJpaEntity::toDomain).toList();
    }

    @Override
    public void recordSignIn(DonorId id, Instant at) {
        jpa.recordSignIn(id.value(), at);
    }

    @Override
    public Optional<Instant> findPreviousSignIn(DonorId id) {
        return jpa.findPreviousSignIn(id.value());
    }

    @Override
    public void forgetSignIns(DonorId id) {
        jpa.forgetSignIns(id.value());
    }
}
