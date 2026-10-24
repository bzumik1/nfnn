package cz.novanadeje.app.donors.application.event;

import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.util.List;
import java.util.UUID;

public record AdministratorSecondFactorRecovered(UUID donorId, String name, EmailAddress email, String senderAccount,
                                                 List<Recipient> recipients) {

    public AdministratorSecondFactorRecovered {
        recipients = List.copyOf(recipients);
    }

    public record Recipient(EmailAddress email, LocaleCode preferredLocale) {
    }
}
