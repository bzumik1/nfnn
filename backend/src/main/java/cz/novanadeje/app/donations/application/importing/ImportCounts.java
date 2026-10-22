package cz.novanadeje.app.donations.application.importing;

public record ImportCounts(int movementsReceived, int incomingNew, int incomingKnown, int pairedBySymbol, int pairedByAccount,
                           int pairedByConfirmedSymbol, int accountsLearned, int leftUnpaired) {

    private static final ImportCounts NONE = new ImportCounts(0, 0, 0, 0, 0, 0, 0, 0);

    public static ImportCounts none() {
        return NONE;
    }
}
