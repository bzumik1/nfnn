package cz.novanadeje.app.content.domain.media;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;

public interface MediaImageRepository {

    void save(MediaImage image);

    Optional<MediaImage> findById(MediaId id);

    Optional<MediaVariant> findVariantAtLeast(MediaId id, int wantedWidth);

    Optional<MediaVariant> findLargestVariant(MediaId id);

    Optional<MediaSize> findSize(MediaId id);

    Map<MediaId, MediaSize> findSizes(Collection<MediaId> ids);

    boolean exists(MediaId id);

    void lockForUse(MediaId id);

    boolean placeFocalPoint(MediaId id, Optional<FocalPoint> point);

    Map<MediaId, FocalPoint> findFocalPoints(Collection<MediaId> ids);

    void delete(MediaId id);

    boolean deleteIfUnused(MediaId id);

    int deleteUnusedUploadedBefore(Instant moment);
}
