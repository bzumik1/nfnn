package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;

public interface BankLogoImages {

    FetchedBankLogo fetch(BankLogoSource source);
}
