package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.ReceiptSignatoryService;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations/receipt-signatory")
class AdminReceiptSignatoryController {

    private final ReceiptSignatoryService signatories;

    AdminReceiptSignatoryController(ReceiptSignatoryService signatories) {
        this.signatories = signatories;
    }

    @GetMapping
    ReceiptSignatoryResponse read() {
        return ReceiptSignatoryResponse.from(signatories.view());
    }

    @PutMapping
    ReceiptSignatoryResponse.ChosenResponse choose(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReceiptSignatoryRequest request) {
        return ReceiptSignatoryResponse.ChosenResponse.from(signatories.choose(UUID.fromString(jwt.getSubject()),
                new PersonReference(UUID.fromString(request.personId())), request.receiptRole()));
    }
}
