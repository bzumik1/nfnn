package cz.novanadeje.app.donations.domain.importing;

public interface BankImportStateRepository {

    BankImportState current();

    void save(BankImportState state);
}
