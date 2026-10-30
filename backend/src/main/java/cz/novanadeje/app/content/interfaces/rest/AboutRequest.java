package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.about.AboutCommand;
import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.media.MediaId;
import jakarta.validation.constraints.Size;

import java.util.Optional;
import java.util.UUID;

public record AboutRequest(
        UUID photoId,
        @Size(max = AboutPhoto.MAX_ALT_LENGTH) String photoAlt,
        @Size(max = AboutPhoto.MAX_CAPTION_LENGTH) String caption) {

    AboutCommand toCommand() {
        return new AboutCommand(Optional.ofNullable(photoId).map(MediaId::new), Optional.ofNullable(photoAlt), Optional.ofNullable(caption));
    }
}
