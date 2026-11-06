package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.infrastructure.search.AccentFolding;
import cz.novanadeje.app.shared.infrastructure.search.CzechCollation;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface DonorJpaRepository extends JpaRepository<DonorJpaEntity, UUID> {

    String IN_CZECH_ORDER = " order by collate(d.name as `" + CzechCollation.NAME + "`), d.email";

    Optional<DonorJpaEntity> findByEmail(String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from DonorJpaEntity d where d.id = :id")
    Optional<DonorJpaEntity> findByIdForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from DonorJpaEntity d where d.email = :email")
    Optional<DonorJpaEntity> findByEmailForUpdate(@Param("email") String email);

    boolean existsByEmail(String email);

    boolean existsByVariableSymbol(String variableSymbol);

    @Query("select d from DonorJpaEntity d where :role member of d.roles" + IN_CZECH_ORDER)
    List<DonorJpaEntity> findByRole(Role role);

    @Query("select d from DonorJpaEntity d left join fetch d.roles order by d.id")
    List<DonorJpaEntity> findAllWithRoles();

    @Query("select d from DonorJpaEntity d where lower(function('translate', d.name, '" + AccentFolding.ACCENTED + "', '" + AccentFolding.PLAIN + "'))"
            + " like concat('%', :query, '%') escape '!'"
            + " or lower(function('translate', d.email, '" + AccentFolding.ACCENTED + "', '" + AccentFolding.PLAIN + "')) like concat('%', :query, '%') escape '!'"
            + " or d.variableSymbol like concat(:query, '%') escape '!'" + IN_CZECH_ORDER)
    List<DonorJpaEntity> search(@Param("query") String query, Pageable page);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(nativeQuery = true, value = "delete from donor where id in (select id from donor"
            + " where email_verified_at is null and erased_at is null and registered_at < :cutoff"
            + " order by id for update skip locked)")
    int deleteUnconfirmedRegisteredBefore(@Param("cutoff") Instant cutoff);

    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "update donor set previous_signed_in_at = last_signed_in_at, last_signed_in_at = :at where id = :id")
    void recordSignIn(@Param("id") UUID id, @Param("at") Instant at);

    @Query("select d.previousSignedInAt from DonorJpaEntity d where d.id = :id")
    Optional<Instant> findPreviousSignIn(@Param("id") UUID id);

    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "update donor set previous_signed_in_at = null, last_signed_in_at = null where id = :id")
    void forgetSignIns(@Param("id") UUID id);
}
