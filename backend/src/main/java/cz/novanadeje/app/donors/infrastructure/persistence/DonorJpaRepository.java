package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.infrastructure.search.AccentFolding;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface DonorJpaRepository extends JpaRepository<DonorJpaEntity, UUID> {

    Optional<DonorJpaEntity> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByVariableSymbol(String variableSymbol);

    @Query("select d from DonorJpaEntity d where :role member of d.roles order by d.name, d.email")
    List<DonorJpaEntity> findByRole(Role role);

    @Query("select d from DonorJpaEntity d where lower(function('translate', d.name, '" + AccentFolding.ACCENTED + "', '" + AccentFolding.PLAIN + "'))"
            + " like concat('%', :query, '%') escape '!'"
            + " or lower(function('translate', d.email, '" + AccentFolding.ACCENTED + "', '" + AccentFolding.PLAIN + "')) like concat('%', :query, '%') escape '!'"
            + " or d.variableSymbol like concat(:query, '%') escape '!' order by d.name, d.email")
    List<DonorJpaEntity> search(@Param("query") String query, Pageable page);
}
