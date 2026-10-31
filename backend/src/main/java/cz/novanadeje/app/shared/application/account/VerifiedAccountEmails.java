package cz.novanadeje.app.shared.application.account;

import cz.novanadeje.app.shared.domain.EmailAddress;

import java.util.Optional;
import java.util.UUID;

public interface VerifiedAccountEmails {

    Optional<EmailAddress> verifiedEmailOf(UUID accountId);

    boolean belongsToVerifiedAccount(EmailAddress email);
}
