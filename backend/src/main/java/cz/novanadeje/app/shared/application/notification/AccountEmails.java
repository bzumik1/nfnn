package cz.novanadeje.app.shared.application.notification;

import java.util.Optional;
import java.util.UUID;

public interface AccountEmails {

    Optional<String> emailOf(UUID accountId);
}
