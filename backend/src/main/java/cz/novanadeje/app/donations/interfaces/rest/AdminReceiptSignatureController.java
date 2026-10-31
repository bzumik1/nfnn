package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.ReceiptSignatureService;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureImage;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations/receipt-signatures/{personId}")
class AdminReceiptSignatureController {

    private final ReceiptSignatureService signatures;

    AdminReceiptSignatureController(ReceiptSignatureService signatures) {
        this.signatures = signatures;
    }

    @GetMapping
    ReceiptSignatureResponse current(@PathVariable UUID personId) {
        return ReceiptSignatureResponse.from(signatures.currentOf(new PersonReference(personId)));
    }

    @PostMapping
    ReceiptSignatureResponse upload(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID personId, @RequestPart("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new UnsupportedSignatureImage("it is empty");
        }
        byte[] upload;
        try {
            upload = file.getBytes();
        } catch (IOException unreadable) {
            throw new UnsupportedSignatureImage("it could not be read");
        }
        return ReceiptSignatureResponse.of(signatures.upload(admin(jwt), new PersonReference(personId), upload));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID personId) {
        signatures.remove(admin(jwt), new PersonReference(personId));
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
