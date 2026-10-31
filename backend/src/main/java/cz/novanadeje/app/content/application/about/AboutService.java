package cz.novanadeje.app.content.application.about;

import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.about.AboutSection;
import cz.novanadeje.app.content.domain.about.AboutSectionRepository;
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
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class AboutService {

    static final String CHANGE_ACTION = "CHANGE_ABOUT_PHOTO";
    static final String REMOVE_ACTION = "REMOVE_ABOUT_PHOTO";

    private final AboutSectionRepository about;
    private final MediaImageRepository media;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public AboutService(AboutSectionRepository about, MediaImageRepository media, ApplicationEventPublisher events, Clock clock) {
        this.about = about;
        this.media = media;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AboutView read() {
        return new AboutView(about.find()
                .flatMap(AboutSection::photo)
                .flatMap(photo -> media.findSize(photo.image()).map(size -> AboutPhotoView.of(photo, size))));
    }

    public AboutView change(UUID adminId, AboutCommand command) {
        Instant now = clock.instant();
        Optional<AboutPhoto> next = command.toPhoto();
        Optional<MediaSize> size = next.map(photo -> media.findSize(photo.image()).orElseThrow(() -> new MediaNotFound(photo.image())));
        Optional<AboutSection> stored = about.find();
        if (next.isEmpty() && stored.flatMap(AboutSection::photo).isEmpty()) {
            return AboutView.withoutPhoto();
        }
        AboutSection current = stored.orElseGet(() -> AboutSection.withoutPhoto(now));
        AboutSection changed = current.show(next, now);
        about.save(changed);
        current.imageLeftBy(changed).ifPresent(media::deleteIfUnused);
        audit(adminId, current.image(), changed.image(), now);
        return new AboutView(next.flatMap(photo -> size.map(photoSize -> AboutPhotoView.of(photo, photoSize))));
    }

    private void audit(UUID adminId, Optional<MediaId> before, Optional<MediaId> after, Instant now) {
        if (after.isEmpty()) {
            MediaId removed = before.orElseThrow();
            publish(adminId, REMOVE_ACTION, "Fotka " + removed + " v sekci O nás odebrána", now);
            return;
        }
        MediaId shown = after.get();
        String verb = before.equals(after) ? "upravena" : "nastavena";
        publish(adminId, CHANGE_ACTION, "Fotka " + shown + " v sekci O nás " + verb, now);
    }

    private void publish(UUID adminId, String action, String details, Instant now) {
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.empty(), details, now));
    }
}
