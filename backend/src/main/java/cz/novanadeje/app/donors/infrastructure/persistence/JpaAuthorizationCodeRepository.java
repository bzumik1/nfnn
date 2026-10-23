package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.AuthorizationCode;
import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
class JpaAuthorizationCodeRepository implements AuthorizationCodeRepository {

    private final AuthorizationCodeJpaRepository jpa;

    JpaAuthorizationCodeRepository(AuthorizationCodeJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(AuthorizationCode code) {
        jpa.save(AuthorizationCodeJpaEntity.fromDomain(code));
    }

    @Override
    public Optional<AuthorizationCode> findBySecretHash(String secretHash) {
        return jpa.findBySecretHash(secretHash).map(AuthorizationCodeJpaEntity::toDomain);
    }

    @Override
    public boolean markUsed(UUID codeId, Instant at) {
        return jpa.markUsed(codeId, at) == 1;
    }
}
