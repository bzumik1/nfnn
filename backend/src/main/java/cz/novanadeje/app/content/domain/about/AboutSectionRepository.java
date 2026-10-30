package cz.novanadeje.app.content.domain.about;

import java.util.Optional;

public interface AboutSectionRepository {

    Optional<AboutSection> find();

    void save(AboutSection section);
}
