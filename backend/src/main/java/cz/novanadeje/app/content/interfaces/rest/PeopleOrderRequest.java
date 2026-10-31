package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonId;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record PeopleOrderRequest(@NotNull @Size(max = Person.MAX_PEOPLE) List<@NotNull UUID> memberIds) {

    List<PersonId> toOrder() {
        return memberIds.stream().map(PersonId::new).toList();
    }
}
