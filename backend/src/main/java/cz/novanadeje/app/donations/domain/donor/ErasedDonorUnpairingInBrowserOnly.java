package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class ErasedDonorUnpairingInBrowserOnly extends AccessDenied {

    public static final String CODE = "donations/erased-donor-unpairing-in-browser-only";

    public ErasedDonorUnpairingInBrowserOnly(DonorReference donor) {
        super(CODE, "The personal data of donor " + donor + " are erased, so only the administration in a browser unpairs the donor's gift,"
                + " never a connected application");
    }
}
