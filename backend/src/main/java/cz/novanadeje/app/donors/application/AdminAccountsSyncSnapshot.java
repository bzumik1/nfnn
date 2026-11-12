package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;

import java.util.List;

public record AdminAccountsSyncSnapshot(DonorId subject, boolean administrator, List<DonorAccountView> accounts, List<AdminActionView> actions) {

    public AdminAccountsSyncSnapshot {
        if (subject == null || accounts == null || actions == null) {
            throw new IllegalArgumentException("An accounts sync snapshot needs its subject, the accounts and the administrators' actions");
        }
        if (!administrator && (!accounts.isEmpty() || !actions.isEmpty())) {
            throw new IllegalArgumentException("A snapshot for an account without the administration holds no rows");
        }
        accounts = List.copyOf(accounts);
        actions = List.copyOf(actions);
    }

    public static AdminAccountsSyncSnapshot withoutAdministration(DonorId subject) {
        return new AdminAccountsSyncSnapshot(subject, false, List.of(), List.of());
    }
}
