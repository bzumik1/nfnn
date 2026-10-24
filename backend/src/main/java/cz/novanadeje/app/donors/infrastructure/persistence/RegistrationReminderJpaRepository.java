package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

interface RegistrationReminderJpaRepository extends JpaRepository<RegistrationReminderJpaEntity, UUID> {

    @Query(nativeQuery = true, value = "select d.id from donor d"
            + " where d.email_verified_at is null and d.erased_at is null"
            + " and d.registered_at > :after and d.registered_at <= :until"
            + " and not exists (select 1 from donor_registration_reminder r where r.donor_id = d.id)"
            + " order by d.registered_at limit :limit")
    List<UUID> findDue(@Param("after") Instant after, @Param("until") Instant until, @Param("limit") int limit);

    @Transactional
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "insert into donor_registration_reminder (donor_id, sent_at) values (:donorId, :sentAt)"
            + " on conflict (donor_id) do nothing")
    int insertIgnoringRecorded(@Param("donorId") UUID donorId, @Param("sentAt") Instant sentAt);
}
