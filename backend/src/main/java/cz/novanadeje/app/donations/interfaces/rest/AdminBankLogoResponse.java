package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.BankLogoAdminRow;

import java.time.Instant;
import java.util.UUID;

record AdminBankLogoResponse(String code, String bankName, String sourceUrl, boolean sourceAllowed, String version, UUID imageId, String imageSha256,
                             Instant fetchedAt, Instant checkedAt, String lastFailure) {

    static AdminBankLogoResponse from(BankLogoAdminRow row) {
        return new AdminBankLogoResponse(row.code(), row.bankName(), row.sourceUrl(), row.sourceAllowed(), row.version(), row.imageId(), row.imageSha256(),
                row.fetchedAt(), row.checkedAt(), row.lastFailure());
    }
}
