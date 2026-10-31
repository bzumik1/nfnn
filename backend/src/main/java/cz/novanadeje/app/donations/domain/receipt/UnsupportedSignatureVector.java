package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class UnsupportedSignatureVector extends RuleViolation {

    public static final String CODE = "donations/unsupported-signature-vector";

    private final SignatureVectorProblem problem;

    public UnsupportedSignatureVector(SignatureVectorProblem problem) {
        super(CODE, "The uploaded SVG cannot be used as a signature: " + problem.code());
        this.problem = problem;
    }

    public SignatureVectorProblem problem() {
        return problem;
    }
}
