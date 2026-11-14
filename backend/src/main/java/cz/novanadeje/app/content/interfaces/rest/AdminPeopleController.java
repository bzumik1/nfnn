package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.people.ActingAdministrator;
import cz.novanadeje.app.content.application.people.FoundersNoteService;
import cz.novanadeje.app.content.application.people.PeopleAdminService;
import cz.novanadeje.app.content.application.people.PeopleFootnoteService;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/content/people")
class AdminPeopleController {

    private static final String SCOPE_CLAIM = "scope";

    private final PeopleAdminService people;
    private final FoundersNoteService notes;
    private final PeopleFootnoteService footnotes;

    AdminPeopleController(PeopleAdminService people, FoundersNoteService notes, PeopleFootnoteService footnotes) {
        this.people = people;
        this.notes = notes;
        this.footnotes = footnotes;
    }

    @GetMapping
    PeopleResponse read() {
        return PeopleResponse.from(people.list(), notes.current(), footnotes.current());
    }

    @GetMapping("/me")
    OwnPersonResponse mine(@AuthenticationPrincipal Jwt jwt) {
        return new OwnPersonResponse(people.mine(admin(jwt)).map(PersonResponse::from).orElse(null));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    PersonResponse add(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PersonRequest request) {
        return PersonResponse.from(people.add(admin(jwt), request.toCommand()));
    }

    @PutMapping("/order")
    PeopleResponse order(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PeopleOrderRequest request) {
        return PeopleResponse.from(people.order(admin(jwt), request.toOrder()), notes.current(), footnotes.current());
    }

    @PutMapping("/note")
    FoundersNoteResponse changeNote(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody FoundersNoteRequest request, ExpectedVersion expected) {
        return FoundersNoteResponse.from(notes.change(admin(jwt), Optional.ofNullable(request.text()), expected));
    }

    @PutMapping("/footnote")
    PeopleFootnoteResponse changeFootnote(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PeopleFootnoteRequest request,
                                          ExpectedVersion expected) {
        return PeopleFootnoteResponse.from(footnotes.change(admin(jwt), Optional.ofNullable(request.text()), expected));
    }

    @PutMapping("/{id}")
    PersonResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PersonRequest request) {
        return PersonResponse.from(people.update(admin(jwt), new PersonId(id), request.toCommand(), jwt.hasClaim(SCOPE_CLAIM)));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        people.remove(admin(jwt), new PersonId(id));
    }

    @PostMapping("/{id}/signature")
    PersonResponse setSignature(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody SignatureRequest request) {
        return PersonResponse.from(people.setSignature(acting(jwt), new PersonId(id), new MediaId(request.imageId())));
    }

    @DeleteMapping("/{id}/signature")
    PersonResponse removeSignature(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return PersonResponse.from(people.removeSignature(acting(jwt), new PersonId(id)));
    }

    private static ActingAdministrator acting(Jwt jwt) {
        return new ActingAdministrator(admin(jwt),
                Optional.ofNullable(jwt.getClaimAsString(JwtProperties.CLIENT_CLAIM)).filter(client -> !client.isBlank()));
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
