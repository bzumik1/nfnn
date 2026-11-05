package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

interface DonorDeviceJpaRepository extends JpaRepository<DonorDeviceJpaEntity, UUID> {

    String HAS_USABLE_TOKEN = "exists (select t.id from RefreshTokenJpaEntity t where t.deviceId = d.id and t.usedAt is null"
            + " and t.revokedAt is null and t.expiresAt > :now)";

    @Query("select d from DonorDeviceJpaEntity d where d.donorId = :donorId and d.endedAt is null and " + HAS_USABLE_TOKEN)
    List<DonorDeviceJpaEntity> findSignedInOf(@Param("donorId") UUID donorId, @Param("now") Instant now);

    @Query("select d from DonorDeviceJpaEntity d where d.donorId = :donorId and d.endedAt is null order by d.id")
    List<DonorDeviceJpaEntity> findActiveOf(@Param("donorId") UUID donorId);

    @Query("select count(d) > 0 from DonorDeviceJpaEntity d where d.id = :id and d.endedAt is null and " + HAS_USABLE_TOKEN)
    boolean isSignedIn(@Param("id") UUID id, @Param("now") Instant now);

    @Query("select d from DonorDeviceJpaEntity d where d.endedAt is null and not " + HAS_USABLE_TOKEN + " order by d.id")
    List<DonorDeviceJpaEntity> findActiveWithoutUsableTokenAt(@Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from DonorDeviceJpaEntity d where d.endedAt < :cutoff")
    int deleteEndedBefore(@Param("cutoff") Instant cutoff);
}
