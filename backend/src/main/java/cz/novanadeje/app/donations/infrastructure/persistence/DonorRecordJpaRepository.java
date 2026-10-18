package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DonorRecordJpaRepository extends JpaRepository<DonorRecordJpaEntity, UUID> {

    Optional<DonorRecordJpaEntity> findByVariableSymbol(String variableSymbol);
}
