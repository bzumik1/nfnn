package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.sync.AdminDonationsSyncSnapshot;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

@Component
class AdminDonationsSyncProjection {

    static final String PAYMENTS = "payments:";
    static final String DONATIONS = "donations:";
    static final String DONOR_RECORDS = "donor-records:";
    static final String LINKS = "links:";
    static final String RECEIPTS = "receipts:";
    static final String SYMBOL_CLAIMS = "symbol-claims";
    static final String IMPORT_STATE = "import-state";
    static final String REPORT_SETTINGS = "report-settings";

    private final JsonMapper json;

    AdminDonationsSyncProjection(JsonMapper json) {
        this.json = json;
    }

    List<SyncChunk> chunksOf(AdminDonationsSyncSnapshot snapshot) {
        return List.of();
    }
}
