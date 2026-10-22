package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

record SymbolClaimRequest(
        @NotBlank(message = "{donations.symbolClaim.variableSymbol.invalid}")
        @Pattern(regexp = "[1-9][0-9]{0,9}", message = "{donations.symbolClaim.variableSymbol.invalid}")
        String variableSymbol
) {

    VariableSymbol symbol() {
        return new VariableSymbol(variableSymbol);
    }
}
