package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DonorJpaRepository extends JpaRepository<DonorJpaEntity, UUID> {

    Optional<DonorJpaEntity> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByVariableSymbol(String variableSymbol);

    @Query("select d from DonorJpaEntity d where :role member of d.roles order by d.name, d.email")
    List<DonorJpaEntity> findByRole(Role role);
}
