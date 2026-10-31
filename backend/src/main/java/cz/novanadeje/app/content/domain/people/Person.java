package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

public record Person(PersonId id, PersonDetails details, int position, Optional<MediaId> webSignature, Instant createdAt,
                     Instant updatedAt) {

    public static final int MAX_PEOPLE = 30;

    public Person {
        if (id == null || details == null || webSignature == null || createdAt == null || updatedAt == null) {
            throw new IllegalArgumentException("A person has an id, details, a web signature (even when absent) and the times of their changes");
        }
        if (position < 0) {
            throw new IllegalArgumentException("The position of a person is not negative");
        }
    }

    public static Person add(PersonId id, PersonDetails details, int position, Instant at) {
        return new Person(id, details, position, Optional.empty(), at, at);
    }

    public Person edit(PersonDetails next, Instant at) {
        return new Person(id, next, position, webSignature, createdAt, at);
    }

    public Person placeAt(int nextPosition, Instant at) {
        return new Person(id, details, nextPosition, webSignature, createdAt, at);
    }

    public Person signWith(MediaId signature, Instant at) {
        return new Person(id, details, position, Optional.of(signature), createdAt, at);
    }

    public Person withoutWebSignature(Instant at) {
        return new Person(id, details, position, Optional.empty(), createdAt, at);
    }

    public List<MediaId> images() {
        return Stream.of(details.portrait(), webSignature).flatMap(Optional::stream).toList();
    }

    public List<MediaId> imagesLeftBy(Person next) {
        List<MediaId> kept = next.images();
        return images().stream().filter(image -> !kept.contains(image)).distinct().toList();
    }
}
