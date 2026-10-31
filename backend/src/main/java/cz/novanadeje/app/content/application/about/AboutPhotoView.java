package cz.novanadeje.app.content.application.about;

import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaSize;

import java.util.Optional;

public record AboutPhotoView(MediaId id, int width, int height, Optional<String> alt, Optional<String> caption) {

    static AboutPhotoView of(AboutPhoto photo, MediaSize size) {
        return new AboutPhotoView(photo.image(), size.width(), size.height(), photo.alt(), photo.caption());
    }
}
