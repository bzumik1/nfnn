package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.bankaccount.BankAccountView;
import cz.novanadeje.app.donations.application.sync.DonorSyncSnapshot;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.time.Year;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

@Component
class DonorSyncProjection {

    static final String DONATIONS = "donations:";
    static final String RECEIPTS = "receipts:";
    static final String BANK_ACCOUNTS = "bank-accounts";
    static final String SYMBOL_CLAIMS = "symbol-claims";

    private final JsonMapper json;

    DonorSyncProjection(JsonMapper json) {
        this.json = json;
    }

    List<SyncChunk> chunksOf(DonorSyncSnapshot snapshot) {
        SortedMap<String, List<Object>> chunks = new TreeMap<>();
        snapshot.donations().forEach(donation -> rowsOf(chunks, DONATIONS + donation.receivedYear().getValue()).add(SyncRows.DonationRow.from(donation)));
        snapshot.receipts().forEach(receipt -> rowsOf(chunks, RECEIPTS + yearOf(receipt).getValue()).add(DonorReceiptResponse.from(receipt)));
        snapshot.bankAccounts().stream()
                .sorted(Comparator.comparing((BankAccountView view) -> view.link().id().value().toString()))
                .forEach(view -> rowsOf(chunks, BANK_ACCOUNTS).add(SyncRows.BankAccountRow.from(view)));
        snapshot.symbolClaims().stream()
                .sorted(Comparator.comparing((SymbolClaim claim) -> claim.id().value().toString()))
                .forEach(claim -> rowsOf(chunks, SYMBOL_CLAIMS).add(SyncRows.SymbolClaimRow.from(claim)));
        return chunks.entrySet().stream().map(chunk -> SyncChunk.of(chunk.getKey(), json.valueToTree(chunk.getValue()))).toList();
    }

    private static List<Object> rowsOf(SortedMap<String, List<Object>> chunks, String id) {
        return chunks.computeIfAbsent(id, ignored -> new ArrayList<>());
    }

    private static Year yearOf(DonationReceipt receipt) {
        return receipt.year().orElseGet(() -> receipt.frozen().document().lines().stream()
                .map(ReceiptLine::receivedOn)
                .map(Year::from)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("A single receipt certifies one gift")));
    }
}
