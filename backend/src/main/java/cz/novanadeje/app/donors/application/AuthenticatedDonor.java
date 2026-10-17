package cz.novanadeje.app.donors.application;

public record AuthenticatedDonor(DonorView donor, IssuedTokens tokens) {
}
