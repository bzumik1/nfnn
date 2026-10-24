package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.shared.infrastructure.search.AccentFolding;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface DonorRecordJpaRepository extends JpaRepository<DonorRecordJpaEntity, UUID> {

    Optional<DonorRecordJpaEntity> findByVariableSymbol(String variableSymbol);

    long countByRegisteredAtBefore(Instant end);

    @Query("select r from DonorRecordJpaEntity r where r.erasedAt is null"
            + " and (lower(function('translate', r.name, '" + AccentFolding.ACCENTED + "', '" + AccentFolding.PLAIN + "')) like concat('%', :query, '%') escape '!'"
            + " or r.variableSymbol like concat(:query, '%') escape '!') order by r.name, r.donorId")
    List<DonorRecordJpaEntity> searchByNameOrSymbol(@Param("query") String query, Pageable page);
}
