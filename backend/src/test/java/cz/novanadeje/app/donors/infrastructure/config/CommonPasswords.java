package cz.novanadeje.app.donors.infrastructure.config;

import cz.novanadeje.app.donors.domain.PasswordPolicy;

public final class CommonPasswords {

    public static final PasswordPolicy POLICY = CommonPasswordList.policy();

    private CommonPasswords() {
    }
}
