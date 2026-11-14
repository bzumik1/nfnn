package cz.novanadeje.app.operations.application.restart;

public interface ApplicationRestarter {

    void restartAfterCommit();

    void restartAfterCommitOnceAsyncWorkIsDone();
}
