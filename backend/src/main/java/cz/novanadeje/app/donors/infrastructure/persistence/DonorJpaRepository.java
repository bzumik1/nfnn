package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DonorJpaRepository extends JpaRepository<DonorJpaEntity, UUID> {

    Optional<DonorJpaEntity> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByVariableSymbol(String variableSymbol);
}
