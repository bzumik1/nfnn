package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

interface BankLogoJpaRepository extends JpaRepository<BankLogoJpaEntity, String> {

    @Query("""
            select new cz.novanadeje.app.donations.infrastructure.persistence.BankLogoRow(logo.code, logo.sourceUrl, logo.imageId, image.sha256,
                logo.fetchedAt, logo.checkedAt, logo.lastFailure)
            from BankLogoJpaEntity logo left join BankLogoImageJpaEntity image on image.id = logo.imageId
            order by logo.code""")
    List<BankLogoRow> findAllRows();

    @Query("""
            select new cz.novanadeje.app.donations.infrastructure.persistence.BankLogoRow(logo.code, logo.sourceUrl, logo.imageId, image.sha256,
                logo.fetchedAt, logo.checkedAt, logo.lastFailure)
            from BankLogoJpaEntity logo left join BankLogoImageJpaEntity image on image.id = logo.imageId
            where logo.code = :code""")
    Optional<BankLogoRow> findRow(@Param("code") String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select logo from BankLogoJpaEntity logo where logo.code = :code")
    Optional<BankLogoJpaEntity> findLockedByCode(@Param("code") String code);

    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "insert into bank_logo (code, source_url) values (:code, :sourceUrl) on conflict (code) do nothing")
    int insertIgnoringExisting(@Param("code") String code, @Param("sourceUrl") String sourceUrl);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update BankLogoJpaEntity logo set logo.checkedAt = :checkedAt, logo.lastFailure = null where logo.code = :code and logo.sourceUrl = :sourceUrl")
    int markChecked(@Param("code") String code, @Param("sourceUrl") String sourceUrl, @Param("checkedAt") Instant checkedAt);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update BankLogoJpaEntity logo set logo.lastFailure = :failure where logo.code = :code and logo.sourceUrl = :sourceUrl")
    int markFailed(@Param("code") String code, @Param("sourceUrl") String sourceUrl, @Param("failure") String failure);
}
