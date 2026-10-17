package cz.novanadeje.fio;

public final class FioHistoryLockedException extends FioException {

    private static final int UNPROCESSABLE_ENTITY = 422;

    public FioHistoryLockedException(String message, String responseBody) {
        super(message, UNPROCESSABLE_ENTITY, responseBody);
    }
}
