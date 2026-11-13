package cz.novanadeje.app.shared.application.version;

public sealed interface WritePrecondition {

    static WritePrecondition anything() {
        return new Anything();
    }

    static WritePrecondition absent() {
        return new Absent();
    }

    static WritePrecondition matching(ExpectedVersion expected) {
        return new Matching(expected);
    }

    record Anything() implements WritePrecondition {
    }

    record Absent() implements WritePrecondition {
    }

    record Matching(ExpectedVersion expected) implements WritePrecondition {

        public Matching {
            if (expected == null) {
                throw new IllegalArgumentException("A matching precondition names the expected version");
            }
        }
    }
}
