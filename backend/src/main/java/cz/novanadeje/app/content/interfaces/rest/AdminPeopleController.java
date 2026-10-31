package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.people.FoundersNoteService;
import cz.novanadeje.app.content.application.people.PeopleAdminService;
import cz.novanadeje.app.content.application.people.PeopleFootnoteService;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.people.PersonId;
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
        return PeopleResponse.from(people.list(), notes.read(), footnotes.read());
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
        return PeopleResponse.from(people.order(admin(jwt), request.toOrder()), notes.read(), footnotes.read());
    }

    @PutMapping("/note")
    FoundersNoteResponse changeNote(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody FoundersNoteRequest request) {
        return new FoundersNoteResponse(notes.change(admin(jwt), Optional.ofNullable(request.text())).orElse(null));
    }

    @PutMapping("/footnote")
    PeopleFootnoteResponse changeFootnote(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PeopleFootnoteRequest request) {
        return new PeopleFootnoteResponse(footnotes.change(admin(jwt), Optional.ofNullable(request.text())).orElse(null));
    }

    @PutMapping("/{id}")
    PersonResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PersonRequest request) {
        return PersonResponse.from(people.update(admin(jwt), new PersonId(id), request.toCommand()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        people.remove(admin(jwt), new PersonId(id));
    }

    @PostMapping("/{id}/web-signature")
    PersonResponse setWebSignature(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody WebSignatureRequest request) {
        return PersonResponse.from(people.setWebSignature(admin(jwt), new PersonId(id), new MediaId(request.imageId())));
    }

    @DeleteMapping("/{id}/web-signature")
    PersonResponse removeWebSignature(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return PersonResponse.from(people.removeWebSignature(admin(jwt), new PersonId(id)));
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
