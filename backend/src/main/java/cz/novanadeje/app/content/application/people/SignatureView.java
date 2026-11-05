package cz.novanadeje.app.content.application.people;

import java.util.Optional;

public record SignatureView(PersonImageView image, String name, Optional<String> role, Optional<PersonImageView> portrait) {

    public SignatureView {
        if (image == null || name == null || role == null || portrait == null) {
            throw new IllegalArgumentException("A signature has its image, the name, the role and the portrait of its person (each even when absent)");
        }
    }
}
