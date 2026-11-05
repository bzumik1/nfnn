package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface PushSubscriptionJpaRepository extends JpaRepository<PushSubscriptionJpaEntity, UUID> {

    List<PushSubscriptionJpaEntity> findByAdministratorIdOrderByCreatedAtAscIdAsc(UUID administratorId);

    List<PushSubscriptionJpaEntity> findByEndpointOrDeviceId(String endpoint, UUID deviceId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PushSubscriptionJpaEntity s set s.bankImportAlerts = :bankImport, s.backupAlerts = :backups, s.mailAlerts = :mail "
            + "where s.id = :id and s.administratorId = :administratorId")
    int changeAlerts(@Param("id") UUID id, @Param("administratorId") UUID administratorId, @Param("bankImport") boolean bankImport,
                     @Param("backups") boolean backups, @Param("mail") boolean mail);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PushSubscriptionJpaEntity s where s.endpoint = :endpoint or s.deviceId = :deviceId")
    int deleteByEndpointOrDevice(@Param("endpoint") String endpoint, @Param("deviceId") UUID deviceId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PushSubscriptionJpaEntity s where s.deviceId = :deviceId")
    int deleteAllOfDevice(@Param("deviceId") UUID deviceId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PushSubscriptionJpaEntity s where s.administratorId = :administratorId")
    int deleteAllOf(@Param("administratorId") UUID administratorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PushSubscriptionJpaEntity s where s.id = :id")
    int deleteOne(@Param("id") UUID id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PushSubscriptionJpaEntity s")
    int deleteEvery();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PushSubscriptionJpaEntity s set s.lastDeliveredAt = :at, s.failuresInARow = 0 where s.id = :id")
    int markDelivered(@Param("id") UUID id, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PushSubscriptionJpaEntity s set s.failuresInARow = s.failuresInARow + 1 where s.id = :id")
    int markFailed(@Param("id") UUID id);

    @Query("select s.failuresInARow from PushSubscriptionJpaEntity s where s.id = :id")
    Optional<Integer> failuresOf(@Param("id") UUID id);
}
