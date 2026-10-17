package cz.novanadeje.app.donations.application.pairing;

public record PairingOutcome(int pairedBySymbol, int pairedByAccount, int accountsLearned, int leftUnpaired) {
}
