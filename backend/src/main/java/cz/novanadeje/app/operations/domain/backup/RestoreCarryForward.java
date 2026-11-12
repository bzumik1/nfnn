package cz.novanadeje.app.operations.domain.backup;

public record RestoreCarryForward(int erasures, int credentials, int roles, int adminActions, int receiptNumbersSkipped) {

    public RestoreCarryForward {
        if (erasures < 0 || credentials < 0 || roles < 0 || adminActions < 0 || receiptNumbersSkipped < 0) {
            throw new IllegalArgumentException("A restore carries forward no negative number of erasures, credentials, roles, admin actions or receipt numbers");
        }
    }
}
