package cz.novanadeje.app.content.application.people;

import java.util.Optional;

public record BoardMemberView(String name, Optional<String> note) {
}
