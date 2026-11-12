package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.shared.application.version.ExpectedVersion;

public sealed interface BankLogoPrecondition {

    static BankLogoPrecondition anything() {
        return new Anything();
    }

    static BankLogoPrecondition absent() {
        return new Absent();
    }

    static BankLogoPrecondition matching(ExpectedVersion expected) {
        return new Matching(expected);
    }

    record Anything() implements BankLogoPrecondition {
    }

    record Absent() implements BankLogoPrecondition {
    }

    record Matching(ExpectedVersion expected) implements BankLogoPrecondition {

        public Matching {
            if (expected == null) {
                throw new IllegalArgumentException("A matching precondition names the expected version");
            }
        }
    }
}
