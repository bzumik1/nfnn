package cz.novanadeje.app.donations.application.importing;

public interface BankImportRequests {

    void requestImport();

    boolean inProgress();
}
