package cz.novanadeje.app.donors.domain;

public final class Donors {

    private Donors() {
    }

    public static Donor withPassword(Donor donor, PasswordHash passwordHash) {
        donor.changePassword(passwordHash);
        return donor;
    }
}
