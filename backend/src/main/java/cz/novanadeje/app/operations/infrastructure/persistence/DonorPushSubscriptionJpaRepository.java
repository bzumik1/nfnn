package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface DonorPushSubscriptionJpaRepository extends JpaRepository<DonorPushSubscriptionJpaEntity, UUID> {

    List<DonorPushSubscriptionJpaEntity> findByDonorIdOrderByCreatedAtAscIdAsc(UUID donorId);

    Optional<DonorPushSubscriptionJpaEntity> findByDonorIdAndDeviceId(UUID donorId, UUID deviceId);

    List<DonorPushSubscriptionJpaEntity> findByDonorIdInAndGiftNotificationsTrueOrderByCreatedAtAscIdAsc(Collection<UUID> donorIds);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update DonorPushSubscriptionJpaEntity s set s.giftNotifications = :gifts, s.yearlyReceiptNotifications = :yearlyReceipts "
            + "where s.donorId = :donorId and s.deviceId = :deviceId")
    int changeNotifications(@Param("donorId") UUID donorId, @Param("deviceId") UUID deviceId, @Param("gifts") boolean gifts,
                            @Param("yearlyReceipts") boolean yearlyReceipts);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from DonorPushSubscriptionJpaEntity s where s.endpoint = :endpoint or s.deviceId = :deviceId")
    int deleteByEndpointOrDevice(@Param("endpoint") String endpoint, @Param("deviceId") UUID deviceId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from DonorPushSubscriptionJpaEntity s where s.deviceId = :deviceId")
    int deleteAllOfDevice(@Param("deviceId") UUID deviceId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from DonorPushSubscriptionJpaEntity s where s.donorId = :donorId")
    int deleteAllOf(@Param("donorId") UUID donorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from DonorPushSubscriptionJpaEntity s where s.id = :id")
    int deleteOne(@Param("id") UUID id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from DonorPushSubscriptionJpaEntity s")
    int deleteEvery();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update DonorPushSubscriptionJpaEntity s set s.lastDeliveredAt = :at, s.failuresInARow = 0 where s.id = :id")
    int markDelivered(@Param("id") UUID id, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update DonorPushSubscriptionJpaEntity s set s.failuresInARow = s.failuresInARow + 1 where s.id = :id")
    int markFailed(@Param("id") UUID id);

    @Query("select s.failuresInARow from DonorPushSubscriptionJpaEntity s where s.id = :id")
    Optional<Integer> failuresOf(@Param("id") UUID id);
}
