package cz.novanadeje.app.operations.domain.push;

public record PushMessage(PushMessageKind kind, int count) {

    public static final int VERSION = 1;
    public static final int MAX_COUNT = 999;

    public PushMessage {
        if (kind == null || count < 0 || count > MAX_COUNT) {
            throw new IllegalArgumentException("A push message is a kind and a count of open problems");
        }
    }

    public String json() {
        return "{\"v\":" + VERSION + ",\"kind\":\"" + kind.token() + "\",\"count\":" + count + "}";
    }
}
