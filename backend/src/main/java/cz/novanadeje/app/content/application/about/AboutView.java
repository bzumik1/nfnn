package cz.novanadeje.app.content.application.about;

import java.util.Optional;

public record AboutView(Optional<AboutPhotoView> photo) {

    public AboutView {
        if (photo == null) {
            throw new IllegalArgumentException("The About view carries its photo even when absent");
        }
    }

    static AboutView withoutPhoto() {
        return new AboutView(Optional.empty());
    }
}
