package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.importing.BankCheckService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donations/me/bank-check")
class BankCheckController {

    private final BankCheckService bankChecks;

    BankCheckController(BankCheckService bankChecks) {
        this.bankChecks = bankChecks;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    BankCheckResponse requestCheck() {
        return BankCheckResponse.from(bankChecks.requestCheck());
    }

    @GetMapping
    BankCheckResponse currentCheck() {
        return BankCheckResponse.from(bankChecks.currentCheck());
    }
}
