package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.util.Optional;

public record ReceiptParty(DonorType type, String name, PostalAddress address, Optional<String> companyIdentifier,
                           VariableSymbol variableSymbol) {

    public ReceiptParty {
        if (type == null || name == null || name.isBlank() || address == null || companyIdentifier == null || variableSymbol == null) {
            throw new IllegalArgumentException("A receipt party needs its type, name, address, identifier and variable symbol");
        }
        if ((type == DonorType.COMPANY) != companyIdentifier.isPresent()) {
            throw new IllegalArgumentException("A company and only a company has a company identifier");
        }
    }
}
