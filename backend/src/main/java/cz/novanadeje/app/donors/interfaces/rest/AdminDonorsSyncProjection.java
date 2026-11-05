package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminAccountsSyncSnapshot;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

@Component
class AdminDonorsSyncProjection {

    static final String ACCOUNTS = "accounts:";
    static final String AUDIT = "audit:";

    private final JsonMapper json;

    AdminDonorsSyncProjection(JsonMapper json) {
        this.json = json;
    }

    List<SyncChunk> chunksOf(AdminAccountsSyncSnapshot snapshot) {
        return List.of();
    }
}
