package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.FocalPoint;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class FocalPointService {

    static final String ACTION = "CHANGE_PHOTO_FOCAL_POINT";

    private final MediaImageRepository media;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public FocalPointService(MediaImageRepository media, ApplicationEventPublisher events, Clock clock) {
        this.media = media;
        this.events = events;
        this.clock = clock;
    }

    public PhotoView place(UUID adminId, MediaId id, Optional<FocalPoint> point) {
        MediaSize size = media.findSize(id).orElseThrow(() -> new MediaNotFound(id));
        Optional<FocalPoint> current = Optional.ofNullable(media.findFocalPoints(List.of(id)).get(id));
        if (!current.equals(point)) {
            media.placeFocalPoint(id, point);
            events.publishEvent(new AdminActionPerformed(adminId, ACTION, Optional.empty(), details(id, point), clock.instant()));
        }
        return new PhotoView(id, size.width(), size.height(), point);
    }

    private static String details(MediaId id, Optional<FocalPoint> point) {
        return point
                .map(placed -> "Bod výřezu fotky " + id + " nastaven na " + placed.x() + " % zleva a " + placed.y() + " % shora")
                .orElseGet(() -> "Bod výřezu fotky " + id + " zrušen, fotka se ořezává kolem středu");
    }
}
