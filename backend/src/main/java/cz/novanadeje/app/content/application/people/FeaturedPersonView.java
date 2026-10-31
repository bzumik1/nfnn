package cz.novanadeje.app.content.application.people;

import java.util.Optional;

public record FeaturedPersonView(String name, Optional<String> role, Optional<PersonImageView> portrait) {
}
