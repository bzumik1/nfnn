package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminAccountsSyncSnapshot;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkEntry;

import java.util.List;
import java.util.UUID;

record AdminDonorsSyncManifestResponse(UUID subject, boolean administrator, List<SyncChunkEntry> chunks) {

    static AdminDonorsSyncManifestResponse from(AdminAccountsSyncSnapshot snapshot, List<SyncChunkEntry> chunks) {
        return new AdminDonorsSyncManifestResponse(snapshot.subject().value(), snapshot.administrator(), chunks);
    }
}
