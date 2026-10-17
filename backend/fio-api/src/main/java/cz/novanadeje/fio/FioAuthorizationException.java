package cz.novanadeje.fio;

public final class FioAuthorizationException extends FioException {

    public FioAuthorizationException(String message, int statusCode, String responseBody) {
        super(message, statusCode, responseBody);
    }
}
