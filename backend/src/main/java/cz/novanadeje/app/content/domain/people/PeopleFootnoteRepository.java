package cz.novanadeje.app.content.domain.people;

import java.util.Optional;

public interface PeopleFootnoteRepository {

    Optional<PeopleFootnote> find();

    void save(PeopleFootnote footnote);
}
