package cz.novanadeje.app.shared.application.account;

import java.util.UUID;

public interface AdministrationHolders {

    boolean holdsAdministration(UUID accountId);
}
