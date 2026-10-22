package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.bankaccount.DonorBankAccountsService;
import cz.novanadeje.app.donations.application.bankaccount.SymbolClaimService;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/donations/me/bank-accounts")
class DonorBankAccountsController {

    private final DonorBankAccountsService bankAccounts;
    private final SymbolClaimService symbolClaims;

    DonorBankAccountsController(DonorBankAccountsService bankAccounts, SymbolClaimService symbolClaims) {
        this.bankAccounts = bankAccounts;
        this.symbolClaims = symbolClaims;
    }

    @GetMapping
    BankAccountListResponse list(@AuthenticationPrincipal Jwt jwt) {
        return BankAccountListResponse.from(bankAccounts.listBankAccounts(caller(jwt)));
    }

    @PostMapping("/{id}/disconnect")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disconnect(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        bankAccounts.disconnect(caller(jwt), new SenderAccountLinkId(id));
    }

    @PostMapping("/{id}/reconnect")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reconnect(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        bankAccounts.reconnect(caller(jwt), new SenderAccountLinkId(id));
    }

    @PostMapping("/{id}/symbol-claim/confirm")
    SymbolClaimConfirmationResponse confirmSymbol(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                                  @Valid @RequestBody SymbolClaimRequest request) {
        return SymbolClaimConfirmationResponse.from(symbolClaims.confirm(caller(jwt), new SenderAccountLinkId(id), request.symbol()));
    }

    @PostMapping("/{id}/symbol-claim/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void declineSymbol(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody SymbolClaimRequest request) {
        symbolClaims.decline(caller(jwt), new SenderAccountLinkId(id), request.symbol());
    }

    private static DonorReference caller(Jwt jwt) {
        return DonorReference.of(jwt.getSubject());
    }
}
