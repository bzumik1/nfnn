package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.BankLogoAdminRow;

import java.util.List;

record AdminBankLogosResponse(List<AdminBankLogoResponse> items) {

    static AdminBankLogosResponse from(List<BankLogoAdminRow> rows) {
        return new AdminBankLogosResponse(rows.stream().map(AdminBankLogoResponse::from).toList());
    }
}
