package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.infrastructure.search.AccentFolding;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
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

    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "update donor set previous_signed_in_at = last_signed_in_at, last_signed_in_at = :at where id = :id")
    void recordSignIn(@Param("id") UUID id, @Param("at") Instant at);

    @Query("select d.previousSignedInAt from DonorJpaEntity d where d.id = :id")
    Optional<Instant> findPreviousSignIn(@Param("id") UUID id);

    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "update donor set previous_signed_in_at = null, last_signed_in_at = null where id = :id")
    void forgetSignIns(@Param("id") UUID id);
}
