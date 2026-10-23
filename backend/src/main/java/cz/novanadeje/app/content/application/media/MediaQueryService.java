package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class MediaQueryService {

    private final MediaImageRepository media;

    public MediaQueryService(MediaImageRepository media) {
        this.media = media;
    }

    public MediaVariant variant(MediaId id, Optional<Integer> wantedWidth) {
        return media.findById(id).orElseThrow(() -> new MediaNotFound(id)).variantFor(wantedWidth);
    }
}
