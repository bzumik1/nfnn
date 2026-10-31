package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

interface ReceiptSigningKeyAdoptionJpaRepository extends JpaRepository<ReceiptSigningKeyAdoptionJpaEntity, String> {

    @Modifying
    @Query(value = "insert into receipt_signing_key_adoption (restore_id, adopted_at) values (:restoreId, :adoptedAt) on conflict do nothing",
            nativeQuery = true)
    int insertIfAbsent(@Param("restoreId") String restoreId, @Param("adoptedAt") Instant adoptedAt);
}
