package cz.novanadeje.app.shared.application.notification;

import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.util.UUID;

public record AdministratorContact(UUID accountId, EmailAddress email, LocaleCode preferredLocale) {
}
