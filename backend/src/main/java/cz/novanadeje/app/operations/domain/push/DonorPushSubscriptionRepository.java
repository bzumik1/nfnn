package cz.novanadeje.app.operations.domain.push;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DonorPushSubscriptionRepository extends PushRecipientRepository {

    Optional<DonorPushSubscription> findOfDevice(UUID donorId, UUID deviceId);

    List<DonorPushSubscription> findAllOf(UUID donorId);

    List<DonorPushSubscription> findWithGiftNotificationsOf(Collection<UUID> donorIds);

    List<DonorPushSubscription> findWithYearlyReceiptNotificationsOf(Collection<UUID> donorIds);

    void lockWrites();

    void deleteByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId);

    void save(DonorPushSubscription subscription);

    boolean changeNotifications(UUID donorId, UUID deviceId, DonorNotifications notifications);

    int deleteAllOfDevice(UUID deviceId);

    int deleteAllOf(UUID donorId);

    int deleteAll();
}
