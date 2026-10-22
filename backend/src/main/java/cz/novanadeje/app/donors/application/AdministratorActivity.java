package cz.novanadeje.app.donors.application;

import java.util.List;

public record AdministratorActivity(List<AdminActionView> items, boolean hasMore) {
}
