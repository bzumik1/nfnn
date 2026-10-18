package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

public interface ReceiptTemplateJpaRepository extends JpaRepository<ReceiptTemplateJpaEntity, String> {

    @Transactional
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "insert into receipt_template (sha256, content, first_used_at)"
            + " values (:sha256, :content, :firstUsedAt) on conflict (sha256) do nothing")
    int insertIfAbsent(@Param("sha256") String sha256, @Param("content") String content, @Param("firstUsedAt") Instant firstUsedAt);
}
