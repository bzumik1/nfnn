package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.VapidKeys;

public interface PushDelivery {

    PushOutcome deliver(PushSubscription subscription, PushMessage message, VapidKeys keys);
}
