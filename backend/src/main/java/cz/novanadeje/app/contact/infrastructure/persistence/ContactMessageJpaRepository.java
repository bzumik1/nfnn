package cz.novanadeje.app.contact.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface ContactMessageJpaRepository extends JpaRepository<ContactMessageJpaEntity, UUID> {

    @Modifying
    @Query("delete from ContactMessageJpaEntity message where message.receivedAt < :cutoff")
    int deleteReceivedBefore(@Param("cutoff") Instant cutoff);
}
