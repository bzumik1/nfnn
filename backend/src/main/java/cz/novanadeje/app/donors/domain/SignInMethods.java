package cz.novanadeje.app.donors.domain;

public record SignInMethods(DonorId donor, boolean password, int passkeys) {

    public SignInMethods {
        if (donor == null) {
            throw new IllegalArgumentException("Donor id is required");
        }
        if (passkeys < 0) {
            throw new IllegalArgumentException("Passkey count must not be negative");
        }
    }

    public static SignInMethods of(Donor donor, int passkeys) {
        return new SignInMethods(donor.id(), donor.hasPassword(), passkeys);
    }

    public SignInMethods withoutPassword() {
        return kept(new SignInMethods(donor, false, passkeys));
    }

    public SignInMethods withoutPasskey() {
        return kept(new SignInMethods(donor, password, passkeys - 1));
    }

    public SignInMethods withPasskey(int limit) {
        if (passkeys >= limit) {
            throw new PasskeyLimitReached(limit);
        }
        return new SignInMethods(donor, password, passkeys + 1);
    }

    private SignInMethods kept(SignInMethods left) {
        if (!left.password && left.passkeys == 0) {
            throw new LastSignInMethod(donor);
        }
        return left;
    }
}
