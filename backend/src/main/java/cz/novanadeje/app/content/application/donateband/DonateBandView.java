package cz.novanadeje.app.content.application.donateband;

import java.util.Optional;

public record DonateBandView(Optional<DonateBandPhotoView> photo) {

    public DonateBandView {
        if (photo == null) {
            throw new IllegalArgumentException("The donate band view carries its photo even when absent");
        }
    }

    static DonateBandView withoutPhoto() {
        return new DonateBandView(Optional.empty());
    }
}
