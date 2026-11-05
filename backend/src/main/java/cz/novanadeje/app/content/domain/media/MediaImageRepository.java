package cz.novanadeje.app.content.domain.media;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;

public interface MediaImageRepository {

    void save(MediaImage image);

    Optional<MediaImage> findById(MediaId id);

    Optional<MediaSize> findSize(MediaId id);

    boolean exists(MediaId id);

    boolean placeFocalPoint(MediaId id, Optional<FocalPoint> point);

    Map<MediaId, FocalPoint> findFocalPoints(Collection<MediaId> ids);

    void delete(MediaId id);

    boolean deleteIfUnused(MediaId id);

    int deleteUnusedUploadedBefore(Instant moment);
}
