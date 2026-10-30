package cz.novanadeje.app.donations.interfaces.rest;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donations/receipts/status")
class ReceiptStatusController {

    @PostMapping
    ReceiptStatusResponse status(@RequestBody ReceiptStatusRequest request) {
        return new ReceiptStatusResponse("unknown");
    }
}
