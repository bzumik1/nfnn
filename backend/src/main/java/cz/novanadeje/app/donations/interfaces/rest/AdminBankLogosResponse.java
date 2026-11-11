package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.BankLogoAdminRow;

import java.util.List;

record AdminBankLogosResponse(List<BankLogoAdminRow> items) {
}
