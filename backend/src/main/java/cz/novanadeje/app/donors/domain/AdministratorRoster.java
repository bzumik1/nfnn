package cz.novanadeje.app.donors.domain;

import java.util.List;

public final class AdministratorRoster {

    private AdministratorRoster() {
    }

    public static void revoke(Donor donor, List<Donor> administrators, DonorId by) {
        if (donor.id().equals(by)) {
            throw new OwnAdministrationRevoked();
        }
        if (donor.isAdministrator() && administrators.stream().allMatch(administrator -> administrator.id().equals(donor.id()))) {
            throw new LastAdministratorRevoked();
        }
        donor.revokeAdministration();
    }

    public static FirstAdministration grantFirst(Donor donor, List<Donor> administrators) {
        if (donor.isAdministrator()) {
            return FirstAdministration.ALREADY_ADMINISTRATOR;
        }
        if (!administrators.isEmpty()) {
            return FirstAdministration.SITE_HAS_ADMINISTRATOR;
        }
        if (!donor.isEmailVerified()) {
            return FirstAdministration.NOT_CONFIRMED;
        }
        donor.grantFirstAdministration();
        return FirstAdministration.GRANTED;
    }
}
