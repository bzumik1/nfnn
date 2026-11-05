package cz.novanadeje.app.operations.domain.push;

public enum PushMessageKind {
    TEST("test");

    private final String token;

    PushMessageKind(String token) {
        this.token = token;
    }

    public String token() {
        return token;
    }
}
