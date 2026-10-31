package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/donations/receipt-signing-keys")
class AdminReceiptSigningKeysController {

    private final ReceiptSigningKeys keys;

    AdminReceiptSigningKeysController(ReceiptSigningKeys keys) {
        this.keys = keys;
    }

    @GetMapping
    AdminReceiptSigningKeysResponse overview() {
        return AdminReceiptSigningKeysResponse.of(keys.overview());
    }
}
