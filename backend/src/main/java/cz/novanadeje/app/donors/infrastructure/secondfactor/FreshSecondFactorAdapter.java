package cz.novanadeje.app.donors.infrastructure.secondfactor;

import cz.novanadeje.app.donors.application.FreshSecondFactorCheck;
import cz.novanadeje.app.donors.application.PasskeyAssertion;
import cz.novanadeje.app.donors.application.PasskeyProof;
import cz.novanadeje.app.donors.application.SecondFactorProof;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
class FreshSecondFactorAdapter implements FreshSecondFactor {

    private final FreshSecondFactorCheck check;

    FreshSecondFactorAdapter(FreshSecondFactorCheck check) {
        this.check = check;
    }

    @Override
    public void require(UUID accountId, FreshSecondFactorProof proof) {
        PasskeyProof passkey = proof.passkey()
                .map(evidence -> new PasskeyProof(evidence.challenge(), new PasskeyAssertion(evidence.credentialId(), evidence.clientDataJson(),
                        evidence.authenticatorData(), evidence.signature(), evidence.userHandle())))
                .orElse(null);
        check.require(DonorId.of(accountId.toString()), new SecondFactorProof(proof.code().orElse(null), passkey));
    }
}
