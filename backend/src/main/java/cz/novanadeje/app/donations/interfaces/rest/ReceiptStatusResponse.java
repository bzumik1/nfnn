package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;

record ReceiptStatusResponse(String status) {

    static final ReceiptStatusResponse UNKNOWN = new ReceiptStatusResponse("unknown");

    static ReceiptStatusResponse of(ReceiptStatus kept) {
        return new ReceiptStatusResponse(switch (kept) {
            case ACTIVE -> "active";
            case REPLACED -> "replaced";
            case WITHDRAWN -> "withdrawn";
        });
    }
}
