package cz.novanadeje.app.operations.domain.clienterrors;

public enum ClientErrorName implements ClientErrorTerm {

    ERROR("Error"),
    AGGREGATE_ERROR("AggregateError"),
    EVAL_ERROR("EvalError"),
    RANGE_ERROR("RangeError"),
    REFERENCE_ERROR("ReferenceError"),
    SYNTAX_ERROR("SyntaxError"),
    TYPE_ERROR("TypeError"),
    URI_ERROR("URIError"),
    ABORT_ERROR("AbortError"),
    DATA_CLONE_ERROR("DataCloneError"),
    DATA_ERROR("DataError"),
    ENCODING_ERROR("EncodingError"),
    INVALID_ACCESS_ERROR("InvalidAccessError"),
    INVALID_CHARACTER_ERROR("InvalidCharacterError"),
    INVALID_STATE_ERROR("InvalidStateError"),
    NETWORK_ERROR("NetworkError"),
    NOT_ALLOWED_ERROR("NotAllowedError"),
    NOT_FOUND_ERROR("NotFoundError"),
    NOT_READABLE_ERROR("NotReadableError"),
    NOT_SUPPORTED_ERROR("NotSupportedError"),
    OPERATION_ERROR("OperationError"),
    QUOTA_EXCEEDED_ERROR("QuotaExceededError"),
    SECURITY_ERROR("SecurityError"),
    TIMEOUT_ERROR("TimeoutError"),
    UNKNOWN_ERROR("UnknownError"),
    HTTP_ERROR_RESPONSE("HttpErrorResponse"),
    OTHER("Other");

    private final String wire;

    ClientErrorName(String wire) {
        this.wire = wire;
    }

    @Override
    public String wire() {
        return wire;
    }
}
