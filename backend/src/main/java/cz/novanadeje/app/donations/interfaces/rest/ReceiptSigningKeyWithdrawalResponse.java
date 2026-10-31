package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeysOverview;

import java.util.List;

record ReceiptSigningKeyWithdrawalResponse(boolean restarting, String currentKeyId, boolean currentKeyPublished,
                                           List<AdminReceiptSigningKeysResponse.Key> keys, List<AdminReceiptSigningKeysResponse.Mismatch> auditMismatches) {

    ReceiptSigningKeyWithdrawalResponse {
        keys = List.copyOf(keys);
        auditMismatches = List.copyOf(auditMismatches);
    }

    static ReceiptSigningKeyWithdrawalResponse of(boolean restarting, ReceiptSigningKeysOverview overview) {
        AdminReceiptSigningKeysResponse keys = AdminReceiptSigningKeysResponse.of(overview);
        return new ReceiptSigningKeyWithdrawalResponse(restarting, keys.currentKeyId(), keys.currentKeyPublished(), keys.keys(), keys.auditMismatches());
    }
}
