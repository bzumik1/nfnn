package cz.novanadeje.app.shared.application.people;

import java.util.Optional;
import java.util.UUID;

public interface FoundationPeople {

    Optional<FoundationPerson> find(UUID personId);

    Optional<FoundationPerson> findForUpdate(UUID personId);

    Optional<PrintPortrait> printPortraitOf(UUID personId);
}
