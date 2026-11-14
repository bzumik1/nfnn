package cz.novanadeje.app.content.application.donateband;

import cz.novanadeje.app.content.domain.donateband.DonateBand;
import cz.novanadeje.app.content.domain.donateband.DonateBandPhoto;
import cz.novanadeje.app.content.domain.donateband.DonateBandRepository;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class DonateBandService {

    static final String CHANGE_ACTION = "CHANGE_DONATE_BAND_PHOTO";
    static final String REMOVE_ACTION = "REMOVE_DONATE_BAND_PHOTO";

    private final DonateBandRepository band;
    private final MediaImageRepository media;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonateBandService(DonateBandRepository band, MediaImageRepository media, ApplicationEventPublisher events, Clock clock) {
        this.band = band;
        this.media = media;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public DonateBandView read() {
        return new DonateBandView(band.find()
                .flatMap(DonateBand::photo)
                .flatMap(photo -> media.findSize(photo.image()).map(size -> DonateBandPhotoView.of(photo, size, media.findFocalPoints(List.of(photo.image()))))));
    }

    public DonateBandView change(UUID adminId, DonateBandCommand command) {
        Instant now = clock.instant();
        Optional<DonateBandPhoto> next = command.toPhoto();
        next.map(DonateBandPhoto::image).ifPresent(media::lockForUse);
        Optional<MediaSize> size = next.map(photo -> media.findSize(photo.image()).orElseThrow(() -> new MediaNotFound(photo.image())));
        Optional<DonateBand> stored = band.find();
        if (next.isEmpty() && stored.flatMap(DonateBand::photo).isEmpty()) {
            return DonateBandView.withoutPhoto();
        }
        DonateBand current = stored.orElseGet(() -> DonateBand.withoutPhoto(now));
        DonateBand changed = current.show(next, now);
        band.save(changed);
        current.imageLeftBy(changed).ifPresent(media::deleteIfUnused);
        audit(adminId, current.image(), changed.image(), now);
        return new DonateBandView(next.flatMap(photo -> size.map(photoSize -> DonateBandPhotoView.of(photo, photoSize, media.findFocalPoints(List.of(photo.image()))))));
    }

    private void audit(UUID adminId, Optional<MediaId> before, Optional<MediaId> after, Instant now) {
        if (after.isEmpty()) {
            MediaId removed = before.orElseThrow();
            publish(adminId, REMOVE_ACTION, "Fotka " + removed + " v pruhu Přispět odebrána", now);
            return;
        }
        MediaId shown = after.get();
        String verb = before.equals(after) ? "upravena" : "nastavena";
        publish(adminId, CHANGE_ACTION, "Fotka " + shown + " v pruhu Přispět " + verb, now);
    }

    private void publish(UUID adminId, String action, String details, Instant now) {
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.empty(), details, now));
    }
}
