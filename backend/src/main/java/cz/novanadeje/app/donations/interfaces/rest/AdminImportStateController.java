package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.importing.ImportStatusService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/donations")
class AdminImportStateController {

    private final ImportStatusService importStatus;

    AdminImportStateController(ImportStatusService importStatus) {
        this.importStatus = importStatus;
    }

    @GetMapping("/import-state")
    ImportStateResponse importState() {
        return ImportStateResponse.from(importStatus.currentState());
    }
}
