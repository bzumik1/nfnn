package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class UnusedMediaCleanupService {

    private final MediaImageRepository media;
    private final UnusedMediaCleanupProperties properties;
    private final Clock clock;

    public UnusedMediaCleanupService(MediaImageRepository media, UnusedMediaCleanupProperties properties, Clock clock) {
        this.media = media;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public MediaCleanup deleteUnusedMedia() {
        Instant cutoff = clock.instant().minus(properties.maxAge());
        return new MediaCleanup(cutoff, media.deleteUnusedUploadedBefore(cutoff));
    }
}
