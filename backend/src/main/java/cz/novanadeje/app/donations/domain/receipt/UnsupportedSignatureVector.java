package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

import java.util.Optional;

public class UnsupportedSignatureVector extends RuleViolation {

    public static final String CODE = "donations/unsupported-signature-vector";
    static final int MAX_NAME_LENGTH = 40;

    private final SignatureVectorProblem problem;
    private final String name;

    public UnsupportedSignatureVector(SignatureVectorProblem problem) {
        this(problem, null);
    }

    public UnsupportedSignatureVector(SignatureVectorProblem problem, String name) {
        super(CODE, "The uploaded SVG cannot be used as a signature: " + problem.code());
        this.problem = problem;
        this.name = name == null ? null : name.substring(0, Math.min(name.length(), MAX_NAME_LENGTH));
    }

    public SignatureVectorProblem problem() {
        return problem;
    }

    public Optional<String> name() {
        return Optional.ofNullable(name);
    }
}
