package cz.novanadeje.app.content.domain.media;

import java.time.Instant;
import java.util.Optional;

public interface MediaImageRepository {

    void save(MediaImage image);

    Optional<MediaImage> findById(MediaId id);

    Optional<MediaSize> findSize(MediaId id);

    boolean exists(MediaId id);

    void delete(MediaId id);

    boolean deleteIfUnused(MediaId id);

    int deleteUnusedUploadedBefore(Instant moment);
}
