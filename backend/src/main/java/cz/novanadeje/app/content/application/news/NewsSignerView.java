package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.application.people.PersonImageView;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonId;

import java.util.Map;
import java.util.Optional;

public record NewsSignerView(PersonId id, String name, Optional<String> role, Optional<PersonImageView> portrait) {

    static NewsSignerView of(Person person, Map<MediaId, MediaSize> sizes) {
        return new NewsSignerView(person.id(), person.details().name(), person.details().role(), PersonImageView.of(person.details().portrait(), sizes));
    }
}
