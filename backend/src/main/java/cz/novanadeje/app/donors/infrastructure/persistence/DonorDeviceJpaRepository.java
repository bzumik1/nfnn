package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DeviceWipe;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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

    @Query("select d.id from DonorDeviceJpaEntity d where d.id in :ids and d.endedAt is null and " + HAS_USABLE_TOKEN)
    Set<UUID> findSignedInAmong(@Param("ids") Collection<UUID> ids, @Param("now") Instant now);

    @Query("select d from DonorDeviceJpaEntity d where d.endedAt is null and not " + HAS_USABLE_TOKEN + " order by d.id")
    List<DonorDeviceJpaEntity> findActiveWithoutUsableTokenAt(@Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update DonorDeviceJpaEntity d set d.endedAt = :at, d.endReason = :reason where d.id = :id and d.endedAt is null")
    int endIfActive(@Param("id") UUID id, @Param("reason") DeviceSignOutReason reason, @Param("at") Instant at);

    Optional<DonorDeviceJpaEntity> findByStatusSecretHash(String statusSecretHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update DonorDeviceJpaEntity d set d.wipe = :wipe where d.id = :id"
            + " and (d.wipe is null or d.wipe <> cz.novanadeje.app.donors.domain.DeviceWipe.ALL)")
    int directWipe(@Param("id") UUID id, @Param("wipe") DeviceWipe wipe);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update DonorDeviceJpaEntity d set d.wipe = :wipe where d.donorId = :donorId"
            + " and (d.wipe is null or d.wipe <> cz.novanadeje.app.donors.domain.DeviceWipe.ALL)")
    int directWipeOfDonor(@Param("donorId") UUID donorId, @Param("wipe") DeviceWipe wipe);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update DonorDeviceJpaEntity d set d.wipe = cz.novanadeje.app.donors.domain.DeviceWipe.ALL,"
            + " d.platform = cz.novanadeje.app.donors.domain.DevicePlatform.OTHER, d.browser = cz.novanadeje.app.donors.domain.DeviceBrowser.OTHER,"
            + " d.sessionKind = null, d.signedInAt = :at, d.lastUsedAt = :at, d.endedAt = :at,"
            + " d.endReason = cz.novanadeje.app.donors.domain.DeviceSignOutReason.ERASED where d.donorId = :donorId")
    int reduceErasedOf(@Param("donorId") UUID donorId, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from DonorDeviceJpaEntity d where d.endedAt < :cutoff")
    int deleteEndedBefore(@Param("cutoff") Instant cutoff);
}
