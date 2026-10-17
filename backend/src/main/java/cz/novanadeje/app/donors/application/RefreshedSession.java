package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;

public record RefreshedSession(Donor donor, IssuedTokens tokens) {
}
