package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.donateband.DonateBandCommand;
import cz.novanadeje.app.content.domain.donateband.DonateBandPhoto;
import cz.novanadeje.app.content.domain.media.MediaId;
import jakarta.validation.constraints.Size;

import java.util.Optional;
import java.util.UUID;

public record DonateBandRequest(
        UUID photoId,
        @Size(max = DonateBandPhoto.MAX_ALT_LENGTH) String photoAlt) {

    DonateBandCommand toCommand() {
        return new DonateBandCommand(Optional.ofNullable(photoId).map(MediaId::new), Optional.ofNullable(photoAlt));
    }
}
