package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;

public record DonorAccountView(Donor donor, boolean secondFactorEnabled, int passkeys) {
}
