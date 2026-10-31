package cz.novanadeje.app.content.domain.people;

import java.util.Optional;

public interface FoundersNoteRepository {

    Optional<FoundersNote> find();

    void save(FoundersNote note);
}
