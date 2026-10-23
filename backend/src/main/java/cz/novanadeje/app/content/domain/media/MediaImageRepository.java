package cz.novanadeje.app.content.domain.media;

import java.util.Optional;

public interface MediaImageRepository {

    void save(MediaImage image);

    Optional<MediaImage> findById(MediaId id);

    boolean exists(MediaId id);

    void delete(MediaId id);
}
