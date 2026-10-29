package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;

public record AdministratorContact(DonorId id, EmailAddress email, LocaleCode preferredLocale) {
}
