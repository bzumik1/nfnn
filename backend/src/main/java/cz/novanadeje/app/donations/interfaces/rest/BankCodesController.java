package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.bankcode.BankCodeListService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class BankCodesController {

    private final BankCodeListService bankCodes;

    BankCodesController(BankCodeListService bankCodes) {
        this.bankCodes = bankCodes;
    }

    @GetMapping("/api/donations/bank-codes")
    BankCodesResponse list() {
        return BankCodesResponse.from(bankCodes.list());
    }
}
