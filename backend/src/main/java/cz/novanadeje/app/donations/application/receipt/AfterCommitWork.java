package cz.novanadeje.app.donations.application.receipt;

public interface AfterCommitWork {

    void run(Runnable work);
}
