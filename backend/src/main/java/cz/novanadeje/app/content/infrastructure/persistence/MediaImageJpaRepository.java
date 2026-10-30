package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaSize;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

interface MediaImageJpaRepository extends JpaRepository<MediaImageJpaEntity, UUID> {

    String UNUSED = "not exists (select 1 from content_news n where n.cover_media_id = m.id)"
            + " and not exists (select 1 from content_project p where p.cover_media_id = m.id)"
            + " and not exists (select 1 from content_about a where a.photo_media_id = m.id)";

    @Query("select new cz.novanadeje.app.content.domain.media.MediaSize(m.width, m.height) from MediaImageJpaEntity m where m.id = :id")
    Optional<MediaSize> findSizeById(UUID id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "delete from content_media m where m.id = :id and " + UNUSED, nativeQuery = true)
    int deleteIfUnused(UUID id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "delete from content_media m where m.uploaded_at < :moment and " + UNUSED, nativeQuery = true)
    int deleteUnusedUploadedBefore(Instant moment);
}
