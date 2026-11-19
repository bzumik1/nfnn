package cz.novanadeje.app.shared.application.transaction;

public interface AfterCommitWork {

    void run(Runnable work);
}
