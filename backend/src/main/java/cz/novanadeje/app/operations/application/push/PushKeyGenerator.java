package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.VapidKeys;

public interface PushKeyGenerator {

    VapidKeys generate();
}
