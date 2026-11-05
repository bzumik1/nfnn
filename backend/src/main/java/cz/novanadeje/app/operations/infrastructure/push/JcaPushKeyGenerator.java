package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.application.push.PushKeyGenerator;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.springframework.stereotype.Component;

import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Base64;

@Component
class JcaPushKeyGenerator implements PushKeyGenerator {

    @Override
    public VapidKeys generate() {
        KeyPair pair = P256.generate();
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        return new VapidKeys(encoder.encodeToString(P256.uncompressed((ECPublicKey) pair.getPublic())),
                encoder.encodeToString(P256.scalar((ECPrivateKey) pair.getPrivate())));
    }
}
