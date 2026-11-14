package cz.novanadeje.app.operations.application.restart;

public interface ApplicationRestarter {

    void restartAfterCommitOnceAsyncWorkIsDone();

    void restartAfterCommitForRestore();
}
