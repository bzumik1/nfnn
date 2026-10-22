package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.domain.EmailAddress;

public record AdministratorView(DonorId id, String name, EmailAddress email, boolean secondFactorEnabled) {
}
